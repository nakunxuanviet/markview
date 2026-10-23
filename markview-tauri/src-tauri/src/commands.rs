//! Tauri commands — the whole IPC surface exposed to the React frontend.

use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::files;
use crate::folders::{self, ScanConfig};
use crate::markdown;
use crate::prefs::get_path;
use crate::search::{self, SearchOptions};
use crate::security::{
    display_path, real_path, remember_file, remember_folder, set_workspace, validate_filename,
    validate_path, workspace,
};
use crate::state::AppState;
use crate::watcher;

const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
const IMAGE_EXTENSIONS: &[&str] = &[".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];

fn err(message: impl Into<String>) -> Value {
    json!({ "error": message.into() })
}

fn scan_config(state: &AppState) -> ScanConfig {
    match state.settings.lock() {
        Ok(settings) => ScanConfig::from_settings(&settings),
        Err(_) => ScanConfig {
            extensions: vec![
                ".md".into(),
                ".markdown".into(),
                ".mdx".into(),
                ".txt".into(),
            ],
            show_hidden: false,
            exclude: vec![],
            folders_first: true,
        },
    }
}

fn start_watcher(app: &AppHandle, state: &AppState, folder: &Path) {
    if let Ok(mut guard) = state.watcher.lock() {
        *guard = None;
        match watcher::start(app.clone(), folder.to_path_buf()) {
            Ok(handle) => *guard = Some(handle),
            Err(e) => eprintln!(
                "[markview] watcher failed for {}: {e}",
                display_path(folder)
            ),
        }
    }
}

fn tree_result(state: &AppState, path: &Path) -> Value {
    let cfg = scan_config(state);
    let tree = folders::get_tree(path, &cfg, 1);
    json!({ "path": display_path(path), "tree": tree })
}

// === FOLDER ===

#[tauri::command]
pub fn open_folder_path(app: AppHandle, state: State<'_, AppState>, path: String) -> Value {
    let raw = PathBuf::from(&path);
    if !raw.is_dir() {
        return err("Folder not found");
    }
    let real = real_path(&raw);
    set_workspace(&state, &real);
    remember_folder(&state, &real);
    start_watcher(&app, &state, &real);
    tree_result(&state, &real)
}

#[tauri::command]
pub fn get_folder_tree(app: AppHandle, state: State<'_, AppState>, path: String) -> Value {
    let Some(valid) = validate_path(&state, &path, false, true, false, true) else {
        return err("Invalid path");
    };
    if valid.is_dir() && workspace(&state).as_deref() != Some(valid.as_path()) {
        set_workspace(&state, &valid);
        remember_folder(&state, &valid);
        start_watcher(&app, &state, &valid);
    }
    tree_result(&state, &valid)
}

#[tauri::command]
pub fn get_folder_children(state: State<'_, AppState>, path: String) -> Value {
    let Some(valid) = validate_path(&state, &path, false, false, false, true) else {
        return err("Invalid path");
    };
    let cfg = scan_config(&state);
    json!(folders::get_tree(&valid, &cfg, 0))
}

#[tauri::command]
pub fn create_file(state: State<'_, AppState>, folder: String, name: String) -> Value {
    let Some(valid) = validate_path(&state, &folder, false, false, false, true) else {
        return err("Invalid path");
    };
    folders::create_file(&valid, &name)
}

#[tauri::command]
pub fn create_folder(state: State<'_, AppState>, parent: String, name: String) -> Value {
    let Some(valid) = validate_path(&state, &parent, false, false, false, true) else {
        return err("Invalid path");
    };
    folders::create_folder(&valid, &name)
}

#[tauri::command]
pub fn rename_item(state: State<'_, AppState>, old_path: String, new_name: String) -> Value {
    let Some(valid) = validate_path(&state, &old_path, false, false, false, false) else {
        return err("Invalid path");
    };
    folders::rename(&valid, &new_name)
}

#[tauri::command]
pub fn delete_item(state: State<'_, AppState>, path: String) -> Value {
    let Some(valid) = validate_path(&state, &path, false, false, false, false) else {
        return err("Invalid path");
    };
    folders::delete(&valid)
}

#[tauri::command]
pub fn duplicate_file(state: State<'_, AppState>, path: String) -> Value {
    let Some(valid) = validate_path(&state, &path, false, false, false, false) else {
        return err("Invalid path");
    };
    folders::duplicate(&valid)
}

#[tauri::command]
pub fn move_item(state: State<'_, AppState>, src: String, dest_folder: String) -> Value {
    let (Some(src_valid), Some(dest_valid)) = (
        validate_path(&state, &src, false, false, false, false),
        validate_path(&state, &dest_folder, false, false, false, false),
    ) else {
        return err("Invalid path");
    };
    folders::move_item(&src_valid, &dest_valid)
}

#[tauri::command]
pub fn search_filenames(state: State<'_, AppState>, query: String) -> Value {
    let Some(root) = workspace(&state) else {
        return json!([]);
    };
    let cfg = scan_config(&state);
    json!(folders::search_filenames(&root, &query, &cfg))
}

// === FILE I/O ===

#[tauri::command]
pub fn open_file_path(state: State<'_, AppState>, path: String) -> Value {
    let raw = PathBuf::from(&path);
    if !raw.is_file() {
        return err("File not found");
    }
    let real = real_path(&raw);
    remember_file(&state, &real);
    files::read_file_data(&real)
}

#[tauri::command]
pub fn save_file(state: State<'_, AppState>, path: String, content: String) -> Value {
    let Some(valid) = validate_path(&state, &path, true, false, false, false) else {
        return err("Invalid path");
    };
    let result = files::write_file_data(&valid, &content);
    if result.get("success").and_then(Value::as_bool) == Some(true) {
        watcher::note_self_write(&valid);
        remember_file(&state, &valid);
    }
    result
}

#[tauri::command]
pub fn save_file_as(state: State<'_, AppState>, path: String, content: String) -> Value {
    let raw = PathBuf::from(&path);
    if !raw.is_absolute() {
        return err("Invalid path");
    }
    let result = files::write_file_data(&raw, &content);
    if result.get("success").and_then(Value::as_bool) == Some(true) {
        watcher::note_self_write(&raw);
        remember_file(&state, &raw);
    }
    result
}

#[tauri::command]
pub fn get_recent_files(state: State<'_, AppState>) -> Value {
    match state.settings.lock() {
        Ok(settings) => json!(settings.get_str_list("recent_files")),
        Err(_) => json!([]),
    }
}

#[tauri::command]
pub fn get_recent_folders(state: State<'_, AppState>) -> Value {
    match state.settings.lock() {
        Ok(settings) => json!(settings.get_str_list("recent_folders")),
        Err(_) => json!([]),
    }
}

// === SESSION ===

#[tauri::command]
pub fn save_session(state: State<'_, AppState>, data: Value) -> bool {
    let mut payload = data;
    if let Some(obj) = payload.as_object_mut() {
        obj.insert(
            "workspace_folder".to_string(),
            match workspace(&state) {
                Some(p) => Value::String(display_path(&p)),
                None => Value::Null,
            },
        );
    }
    match state.session.lock() {
        Ok(session) => session.save(&payload),
        Err(_) => false,
    }
}

#[tauri::command]
pub fn load_session(state: State<'_, AppState>) -> Value {
    let session = match state.session.lock() {
        Ok(session) => session.load(),
        Err(_) => None,
    };
    let Some(mut session) = session else {
        return Value::Null;
    };

    if let Some(folder) = session
        .get("workspace_folder")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
    {
        let path = PathBuf::from(&folder);
        if path.is_dir() {
            let real = real_path(&path);
            set_workspace(&state, &real);
            if let Ok(mut folders) = state.trusted_folders.lock() {
                folders.insert(real.clone());
            }
            let cfg = scan_config(&state);
            let tree = folders::get_tree(&real, &cfg, 1);
            if let Some(obj) = session.as_object_mut() {
                obj.insert(
                    "workspace_folder".into(),
                    Value::String(display_path(&real)),
                );
                obj.insert("tree".into(), json!(tree));
            }
        } else if let Some(obj) = session.as_object_mut() {
            obj.insert("workspace_folder".into(), Value::Null);
            obj.insert("tree".into(), Value::Null);
        }
    }

    if let Some(tabs) = session.get_mut("tabs").and_then(|t| t.as_object_mut()) {
        for tab in tabs.values_mut() {
            let Some(obj) = tab.as_object_mut() else {
                continue;
            };
            let path = obj.get("path").and_then(|p| p.as_str()).map(str::to_string);
            let Some(path) = path else { continue };
            let raw = Path::new(&path);
            if raw.is_file() {
                let real = real_path(raw);
                if let Ok(mut files) = state.trusted_files.lock() {
                    files.insert(real.clone());
                }
                // Sessions written by older builds stored lowercased paths.
                // Restore the real on-disk case for breadcrumbs and tab titles.
                obj.insert("path".into(), Value::String(display_path(&real)));
                if let Some(name) = real.file_name() {
                    obj.insert(
                        "filename".into(),
                        Value::String(name.to_string_lossy().to_string()),
                    );
                }
            }
        }
    }

    session
}

#[tauri::command]
pub fn backup_tab(state: State<'_, AppState>, tab_id: String, content: String) {
    if let Ok(session) = state.session.lock() {
        session.write_backup(&tab_id, &content);
    }
}

// === MARKDOWN ===

#[tauri::command]
pub fn render_markdown(text: String) -> Value {
    markdown::render(&text)
}

// === SETTINGS ===

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Value {
    match state.settings.lock() {
        Ok(settings) => settings.all(),
        Err(_) => crate::prefs::default_settings(),
    }
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, data: Value) -> bool {
    if !data.is_object() {
        return false;
    }
    match state.settings.lock() {
        Ok(mut settings) => {
            settings.update(&data);
            true
        }
        Err(_) => false,
    }
}

// === IMAGE ===

#[tauri::command]
pub fn save_image(
    state: State<'_, AppState>,
    dest_folder: String,
    filename: String,
    base64_data: String,
) -> Value {
    let Some(folder) = validate_path(&state, &dest_folder, false, false, true, false) else {
        return err("Invalid destination folder");
    };
    let Some(name) = validate_filename(&filename, Some(IMAGE_EXTENSIONS)) else {
        return err("Invalid image filename");
    };
    let Ok(bytes) = STANDARD.decode(base64_data.as_bytes()) else {
        return err("Invalid image data");
    };
    if bytes.len() > MAX_IMAGE_BYTES {
        return err("Image is too large");
    }
    let _ = std::fs::create_dir_all(&folder);
    let target = folder.join(&name);
    match std::fs::write(&target, bytes) {
        Ok(_) => json!({ "success": true, "path": display_path(&target) }),
        Err(e) => err(e.to_string()),
    }
}

// === REVEAL ===

#[tauri::command]
pub fn reveal_in_explorer(state: State<'_, AppState>, path: String) -> Value {
    let Some(valid) = validate_path(&state, &path, true, false, false, true) else {
        return err("Invalid path");
    };
    if !valid.exists() {
        return err("Path not found");
    }

    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("explorer")
        .arg(format!("/select,{}", valid.display()))
        .spawn();

    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open")
        .arg("-R")
        .arg(&valid)
        .spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let spawned = {
        let folder = if valid.is_file() {
            valid.parent().unwrap_or(&valid).to_path_buf()
        } else {
            valid.clone()
        };
        std::process::Command::new("xdg-open").arg(folder).spawn()
    };

    match spawned {
        Ok(_) => json!({ "success": true }),
        Err(e) => err(e.to_string()),
    }
}

// === SEARCH ===

#[tauri::command]
pub fn search_in_files(
    state: State<'_, AppState>,
    query: String,
    folder: Option<String>,
    options: Option<SearchOptions>,
) -> Value {
    let search_root = match folder {
        Some(folder) => match validate_path(&state, &folder, false, true, false, true) {
            Some(path) => Some(path),
            None => return json!([]),
        },
        None => None,
    };

    let Some(root) = workspace(&state) else {
        return json!([]);
    };

    let opts = options.unwrap_or_default();
    let results = match state.settings.lock() {
        Ok(settings) => {
            search::search_in_files(&root, &query, search_root.as_deref(), &settings, &opts)
        }
        Err(_) => Vec::new(),
    };
    json!(results)
}

// === SESSION RESTORE ===

/// Re-establish workspace + file trust after a restart, then return a fresh
/// folder tree. Restored session tabs can then be saved again.
#[tauri::command]
pub fn restore_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: Option<String>,
    files: Vec<String>,
) -> Value {
    let mut tree = Value::Null;
    let mut workspace_path = Value::Null;

    if let Some(folder) = folder {
        let raw = PathBuf::from(&folder);
        if raw.is_dir() {
            let real = real_path(&raw);
            set_workspace(&state, &real);
            remember_folder(&state, &real);
            start_watcher(&app, &state, &real);
            let cfg = scan_config(&state);
            tree = json!(folders::get_tree(&real, &cfg, 1));
            workspace_path = json!(display_path(&real));
        }
    }

    for file in files {
        let raw = PathBuf::from(&file);
        if raw.is_file() {
            remember_file(&state, &raw);
        }
    }

    json!({ "workspace": workspace_path, "tree": tree })
}

// === UTILITIES ===

/// Lightweight path probe used by drag & drop. Only reports the kind of an
/// existing path; it never reads or writes anything.
#[tauri::command]
pub fn path_kind(path: String) -> String {
    let candidate = Path::new(&path);
    if candidate.is_dir() {
        "directory".to_string()
    } else if candidate.is_file() {
        "file".to_string()
    } else {
        "missing".to_string()
    }
}

/// Returns the file handed over on the command line, once.
#[tauri::command]
pub fn take_launch_file(state: State<'_, AppState>) -> Option<String> {
    let stored = state
        .launch_file
        .lock()
        .ok()
        .and_then(|mut slot| slot.take());

    // Fallback for a frontend that boots before `setup` stored the argument.
    stored
        .or_else(|| crate::file_from_args(std::env::args().skip(1)))
        .map(|path| display_path(&path))
}

/// Register a per-user "Open with MarkView" entry for Markdown documents and
/// advertise the ProgID in Windows' "Open with" list. Setting the *default*
/// handler still goes through Windows' UserChoice protection; the UI opens the
/// Default Apps page for that.
#[tauri::command]
pub fn register_file_association() -> Value {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let exe = match std::env::current_exe() {
            Ok(path) => path,
            Err(error) => return err(format!("Cannot locate MarkView: {error}")),
        };
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        let result = (|| -> std::io::Result<()> {
            let (prog_id, _) = hkcu.create_subkey(r"Software\Classes\MarkView.Markdown")?;
            prog_id.set_value("", &"Markdown Document")?;
            prog_id.set_value("FriendlyTypeName", &"Markdown Document")?;
            let (icon, _) = prog_id.create_subkey("DefaultIcon")?;
            icon.set_value("", &format!("\"{}\",0", exe.display()))?;
            let (open, _) = prog_id.create_subkey(r"shell\open\command")?;
            open.set_value("", &format!("\"{}\" \"%1\"", exe.display()))?;

            for ext in [".md", ".markdown", ".mdx"] {
                let (menu, _) = hkcu.create_subkey(format!(
                    r"Software\Classes\SystemFileAssociations\{ext}\shell\MarkView"
                ))?;
                menu.set_value("", &"Open with MarkView")?;
                menu.set_value("Icon", &format!("\"{}\",0", exe.display()))?;
                let (command, _) = menu.create_subkey("command")?;
                command.set_value("", &format!("\"{}\" \"%1\"", exe.display()))?;

                let (open_with, _) =
                    hkcu.create_subkey(format!(r"Software\Classes\{ext}\OpenWithProgids"))?;
                open_with.set_value("MarkView.Markdown", &"")?;
            }
            Ok(())
        })();

        match result {
            Ok(()) => json!({ "success": true }),
            Err(error) => err(format!("Could not update the registry: {error}")),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        err("File associations are only supported on Windows")
    }
}

#[tauri::command]
pub fn unregister_file_association() -> Value {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_ALL_ACCESS};
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = match hkcu.open_subkey_with_flags(r"Software\Classes", KEY_ALL_ACCESS) {
            Ok(key) => key,
            Err(error) => return err(format!("Could not open the registry: {error}")),
        };

        for ext in [".md", ".markdown", ".mdx"] {
            let _ =
                classes.delete_subkey_all(format!(r"SystemFileAssociations\{ext}\shell\MarkView"));
            if let Ok(open_with) =
                classes.open_subkey_with_flags(format!(r"{ext}\OpenWithProgids"), KEY_ALL_ACCESS)
            {
                let _ = open_with.delete_value("MarkView.Markdown");
            }
        }
        let _ = classes.delete_subkey_all("MarkView.Markdown");
        json!({ "success": true })
    }
    #[cfg(not(target_os = "windows"))]
    {
        err("File associations are only supported on Windows")
    }
}

#[tauri::command]
pub fn file_association_status() -> bool {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Classes\SystemFileAssociations\.md\shell\MarkView\command")
            .is_ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
pub fn open_default_apps_settings() -> Value {
    #[cfg(target_os = "windows")]
    {
        match std::process::Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:defaultapps"])
            .spawn()
        {
            Ok(_) => json!({ "success": true }),
            Err(error) => err(format!("Could not open Windows Settings: {error}")),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        err("Only supported on Windows")
    }
}

/// Keeps the native window chrome in step with the in-app theme.
#[tauri::command]
pub fn set_window_theme(window: tauri::Window, theme: String) -> Result<(), String> {
    let mode = if theme == "dark" {
        tauri::Theme::Dark
    } else {
        tauri::Theme::Light
    };
    window
        .set_theme(Some(mode))
        .map_err(|error| error.to_string())
}

// === SETTINGS HELPERS (used by the frontend settings dialog) ===

#[tauri::command]
pub fn get_setting(state: State<'_, AppState>, key_path: String) -> Value {
    match state.settings.lock() {
        Ok(settings) => get_path(&settings.all(), &key_path)
            .cloned()
            .unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}
