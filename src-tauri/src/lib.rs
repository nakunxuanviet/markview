mod commands;
mod files;
mod folders;
mod markdown;
mod prefs;
mod search;
mod security;
mod state;
mod watcher;

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{Duration, UNIX_EPOCH};

use percent_encoding::percent_decode_str;
use serde_json::{json, Value};
use tauri::http::Response;
use tauri::{Emitter, Manager, WindowEvent};

use state::AppState;

/// First existing file in a command line, so `markview.exe "note.md"` and the
/// Explorer context menu both work without parsing flags.
fn file_from_args<I: IntoIterator<Item = String>>(args: I) -> Option<PathBuf> {
    args.into_iter()
        .filter(|arg| !arg.starts_with('-'))
        .map(PathBuf::from)
        .find(|path| path.is_file())
        .map(|path| security::real_path(&path))
}

/// Turn the URI path produced by `convertFileSrc` back into an absolute path.
///
/// WebView2 maps `markview://...` to `http://markview.localhost/...`, which
/// leaves a leading slash in front of Windows drive letters.
fn decode_uri_path(path: &str) -> String {
    let decoded = percent_decode_str(path).decode_utf8_lossy().to_string();
    let chars: Vec<char> = decoded.chars().collect();
    if chars.len() > 2 && chars[0] == '/' && chars[1].is_ascii_alphabetic() && chars[2] == ':' {
        return decoded[1..].to_string();
    }
    decoded
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("avif") => "image/avif",
        _ => "application/octet-stream",
    }
}

fn not_found() -> Response<Vec<u8>> {
    Response::builder()
        .status(404)
        .header("Content-Type", "text/plain")
        .body(b"Not found".to_vec())
        .expect("static response")
}

/// Serve local images referenced from the markdown preview. Access is checked
/// against the same trusted-roots model as the IPC commands, so a document
/// cannot pull arbitrary files off disk.
fn image_etag(meta: &std::fs::Metadata) -> String {
    let mtime = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("W/\"{mtime:x}-{:x}\"", meta.len())
}

fn not_modified(etag: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(304)
        .header("ETag", etag)
        .header("Cache-Control", "private, no-cache")
        .header("Access-Control-Allow-Origin", "*")
        .body(Vec::new())
        .expect("static response")
}

fn serve_image(
    app: &tauri::AppHandle,
    uri_path: &str,
    if_none_match: Option<&str>,
) -> Response<Vec<u8>> {
    let state = app.state::<AppState>();
    let raw = decode_uri_path(uri_path);
    let Some(path) = security::validate_path(&state, &raw, true, true, true, true) else {
        return not_found();
    };
    let Ok(meta) = std::fs::metadata(&path) else {
        return not_found();
    };
    let etag = image_etag(&meta);
    if if_none_match.is_some_and(|value| value == etag) {
        return not_modified(&etag);
    }
    let Ok(bytes) = std::fs::read(&path) else {
        return not_found();
    };
    Response::builder()
        .status(200)
        .header("Content-Type", mime_for(&path))
        .header("ETag", etag)
        .header("Cache-Control", "private, no-cache")
        .header("X-Content-Type-Options", "nosniff")
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .unwrap_or_else(|_| not_found())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // `argv` includes the executable itself as its first element.
            if let Some(file) = file_from_args(argv.into_iter().skip(1)) {
                let _ = app.emit("open-file", file.to_string_lossy().to_string());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if !matches!(event, WindowEvent::CloseRequested { .. }) {
                return;
            }

            let state = window.app_handle().state::<AppState>();
            if !state.allow_close.load(Ordering::SeqCst) {
                // Ask the webview to flush its session before the process
                // exits. `confirm_close` (or the timeout below) flips the flag
                // and closes the window again.
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                }
                if !state.close_requested.swap(true, Ordering::SeqCst) {
                    let _ = window.emit("app-close-requested", ());
                    let app = window.app_handle().clone();
                    let fallback_window = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_secs(3));
                        let state = app.state::<AppState>();
                        if !state.allow_close.swap(true, Ordering::SeqCst) {
                            let _ = fallback_window.close();
                        }
                    });
                }
                return;
            }

            let maximized = window.is_maximized().unwrap_or(false);
            let scale = window.scale_factor().unwrap_or(1.0);
            let size = window
                .outer_size()
                .ok()
                .map(|value| value.to_logical::<f64>(scale));
            let position = window
                .outer_position()
                .ok()
                .map(|value| value.to_logical::<f64>(scale));

            if let Ok(mut settings) = state.settings.lock() {
                let mut config = settings
                    .get("window")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                if !maximized {
                    if let Some(size) = size {
                        config.insert("width".into(), json!(size.width));
                        config.insert("height".into(), json!(size.height));
                    }
                    if let Some(position) = position {
                        config.insert("x".into(), json!(position.x));
                        config.insert("y".into(), json!(position.y));
                    }
                }
                config.insert("maximized".into(), json!(maximized));
                let _ = settings.update(&json!({ "window": Value::Object(config) }));
            };
        })
        .register_asynchronous_uri_scheme_protocol("markview", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let uri_path = request.uri().path().to_string();
            let if_none_match = request
                .headers()
                .get("if-none-match")
                .and_then(|value| value.to_str().ok())
                .map(str::to_string);
            std::thread::spawn(move || {
                responder.respond(serve_image(&app, &uri_path, if_none_match.as_deref()));
            });
        })
        .setup(|app| {
            let data_dir = state::app_data_dir();
            app.manage(AppState::new(data_dir));

            // A file association launch passes the document as an argument.
            if let Some(file) = file_from_args(std::env::args().skip(1)) {
                if let Ok(mut slot) = app.state::<AppState>().launch_file.lock() {
                    *slot = Some(file);
                }
            }

            // Restore the previous window bounds, clamped to the current
            // monitor so a disconnected display cannot hide the app.
            let saved_window = {
                let state = app.state::<AppState>();
                state
                    .settings
                    .lock()
                    .ok()
                    .and_then(|settings| settings.get("window").cloned())
            };
            if let Some(window) = app.get_webview_window("main") {
                let saved = saved_window.as_ref();
                let saved_number = |key: &str| {
                    saved
                        .and_then(|value| value.get(key))
                        .and_then(Value::as_f64)
                };
                let saved_x = saved_number("x");
                let saved_y = saved_number("y");

                // Pick the monitor that actually contains the saved position;
                // falling back to the current/primary monitor only when the
                // saved display is no longer attached.
                let monitor = window
                    .available_monitors()
                    .ok()
                    .and_then(|monitors| {
                        let (Some(x), Some(y)) = (saved_x, saved_y) else {
                            return None;
                        };
                        monitors.into_iter().find(|monitor| {
                            let scale = monitor.scale_factor();
                            let position = monitor.position().to_logical::<f64>(scale);
                            let size = monitor.size().to_logical::<f64>(scale);
                            x >= position.x
                                && x <= position.x + size.width
                                && y >= position.y
                                && y <= position.y + size.height
                        })
                    })
                    .or_else(|| window.current_monitor().ok().flatten())
                    .or_else(|| window.primary_monitor().ok().flatten());
                if let Some(monitor) = monitor {
                    let scale = monitor.scale_factor();
                    let monitor_size = monitor.size().to_logical::<f64>(scale);
                    let monitor_pos = monitor.position().to_logical::<f64>(scale);

                    let max_width = (monitor_size.width - 40.0).max(800.0);
                    let max_height = (monitor_size.height - 80.0).max(480.0);
                    let width = saved_number("width")
                        .unwrap_or((monitor_size.width - 80.0).clamp(900.0, 1280.0))
                        .clamp(800.0, max_width);
                    let height = saved_number("height")
                        .unwrap_or((monitor_size.height - 140.0).clamp(560.0, 800.0))
                        .clamp(480.0, max_height);

                    let _ = window.set_size(tauri::LogicalSize::new(width, height));

                    let visible = match (saved_x, saved_y) {
                        (Some(x), Some(y)) => {
                            x > monitor_pos.x - width + 120.0
                                && x < monitor_pos.x + monitor_size.width - 120.0
                                && y > monitor_pos.y - height + 80.0
                                && y < monitor_pos.y + monitor_size.height - 80.0
                        }
                        _ => false,
                    };
                    if visible {
                        let _ = window.set_position(tauri::LogicalPosition::new(
                            saved_x.unwrap_or(monitor_pos.x),
                            saved_y.unwrap_or(monitor_pos.y),
                        ));
                    } else {
                        let _ = window.center();
                    }

                    let maximized = saved
                        .and_then(|value| value.get("maximized"))
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    if maximized {
                        let _ = window.maximize();
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_folder_path,
            commands::get_folder_tree,
            commands::get_folder_children,
            commands::create_file,
            commands::create_folder,
            commands::rename_item,
            commands::delete_item,
            commands::duplicate_file,
            commands::move_item,
            commands::search_filenames,
            commands::open_file_path,
            commands::open_file_link,
            commands::file_mtimes,
            commands::save_file,
            commands::save_file_as,
            commands::get_recent_files,
            commands::get_recent_folders,
            commands::save_session,
            commands::load_session,
            commands::render_markdown,
            commands::get_settings,
            commands::save_settings,
            commands::restart_watcher,
            commands::save_image,
            commands::import_image,
            commands::reveal_in_explorer,
            commands::search_in_files,
            commands::cancel_search,
            commands::path_kind,
            commands::set_window_theme,
            commands::confirm_close,
            commands::take_launch_file,
            commands::register_file_association,
            commands::unregister_file_association,
            commands::file_association_status,
            commands::open_default_apps_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MarkView");
}
