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

use percent_encoding::percent_decode_str;
use tauri::http::Response;
use tauri::{Emitter, Manager};

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
fn serve_image(app: &tauri::AppHandle, uri_path: &str) -> Response<Vec<u8>> {
    let state = app.state::<AppState>();
    let raw = decode_uri_path(uri_path);
    let Some(path) = security::validate_path(&state, &raw, true, true, true, true) else {
        return not_found();
    };
    let Ok(bytes) = std::fs::read(&path) else {
        return not_found();
    };
    Response::builder()
        .status(200)
        .header("Content-Type", mime_for(&path))
        .header("Cache-Control", "no-cache")
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
        .register_uri_scheme_protocol("markview", |ctx, request| {
            serve_image(ctx.app_handle(), request.uri().path())
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

            // High-DPI displays can make the configured 1280x800 window larger
            // than the screen; shrink it to the work area when that happens.
            if let Some(window) = app.get_webview_window("main") {
                let monitor = window
                    .primary_monitor()
                    .ok()
                    .flatten()
                    .or_else(|| window.current_monitor().ok().flatten());
                if let Some(monitor) = monitor {
                    let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
                    let width = (size.width - 80.0).clamp(900.0, 1280.0);
                    let height = (size.height - 140.0).clamp(560.0, 800.0);
                    let _ = window.set_size(tauri::LogicalSize::new(width, height));
                    let _ = window.center();
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
            commands::save_file,
            commands::save_file_as,
            commands::get_recent_files,
            commands::get_recent_folders,
            commands::save_session,
            commands::load_session,
            commands::backup_tab,
            commands::render_markdown,
            commands::get_settings,
            commands::save_settings,
            commands::get_setting,
            commands::save_image,
            commands::reveal_in_explorer,
            commands::search_in_files,
            commands::path_kind,
            commands::restore_workspace,
            commands::set_window_theme,
            commands::take_launch_file,
            commands::register_file_association,
            commands::unregister_file_association,
            commands::file_association_status,
            commands::open_default_apps_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MarkView");
}
