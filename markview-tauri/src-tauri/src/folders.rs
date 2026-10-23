//! Folder tree + file/folder CRUD.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};

use crate::prefs::SettingsStore;
use crate::security::{display_path, validate_filename};

#[derive(Serialize, Clone)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TreeNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

pub struct ScanConfig {
    pub extensions: Vec<String>,
    pub show_hidden: bool,
    pub exclude: Vec<String>,
    pub folders_first: bool,
}

impl ScanConfig {
    pub fn from_settings(settings: &SettingsStore) -> Self {
        Self {
            extensions: settings.get_string_list_or(
                "files.visible_extensions",
                &[".md", ".markdown", ".mdx", ".txt"],
            ),
            show_hidden: settings.get_bool_or("files.show_hidden_files", false),
            exclude: settings.get_str_list("files.exclude_patterns"),
            folders_first: settings.get_bool_or("files.folders_first", true),
        }
    }
}

pub fn get_tree(root: &Path, cfg: &ScanConfig, max_depth: usize) -> Vec<TreeNode> {
    scan(root, cfg, 0, max_depth)
}

fn scan(dir: &Path, cfg: &ScanConfig, depth: usize, max_depth: usize) -> Vec<TreeNode> {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut names: Vec<std::ffi::OsString> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.file_name())
        .collect();
    names.sort_by_key(|n| n.to_string_lossy().to_lowercase());

    let mut folders = Vec::new();
    let mut files = Vec::new();

    for name_os in names {
        let name = name_os.to_string_lossy().to_string();
        if !cfg.show_hidden && name.starts_with('.') {
            continue;
        }
        if cfg.exclude.iter().any(|p| p == &name) {
            continue;
        }

        let full = dir.join(&name_os);
        let meta = match std::fs::metadata(&full) {
            Ok(m) => m,
            Err(_) => continue,
        };

        if meta.is_dir() {
            let children = if depth >= max_depth {
                Vec::new()
            } else {
                scan(&full, cfg, depth + 1, max_depth)
            };
            folders.push(TreeNode {
                name,
                path: display_path(&full),
                kind: "folder".into(),
                children: Some(children),
                modified: None,
                size: None,
            });
        } else if meta.is_file() {
            let ext = format!(
                ".{}",
                full.extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default()
            );
            if !cfg.extensions.iter().any(|e| e.eq_ignore_ascii_case(&ext)) {
                continue;
            }
            let modified = meta
                .modified()
                .ok()
                .map(|t| chrono::DateTime::<chrono::Local>::from(t).to_rfc3339());
            files.push(TreeNode {
                name,
                path: display_path(&full),
                kind: "file".into(),
                children: None,
                modified,
                size: Some(meta.len()),
            });
        }
    }

    if cfg.folders_first {
        folders.extend(files);
        folders
    } else {
        let mut all = folders;
        all.extend(files);
        all.sort_by_key(|n| n.name.to_lowercase());
        all
    }
}

pub fn create_file(folder: &Path, filename: &str) -> Value {
    let mut name = filename.trim().to_string();
    if !name.to_lowercase().ends_with(".md") {
        name.push_str(".md");
    }
    let Some(name) = validate_filename(&name, None) else {
        return json!({ "error": "Filename contains invalid characters." });
    };

    let target = folder.join(&name);
    if target.exists() {
        return json!({ "error": "File already exists. Choose a different name." });
    }
    match std::fs::write(&target, b"") {
        Ok(_) => json!({ "success": true, "path": display_path(&target), "name": name }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

pub fn create_folder(parent: &Path, folder_name: &str) -> Value {
    let Some(name) = validate_filename(folder_name, None) else {
        return json!({ "error": "Folder name contains invalid characters." });
    };
    let target = parent.join(&name);
    if target.exists() {
        return json!({ "error": "Folder already exists." });
    }
    match std::fs::create_dir_all(&target) {
        Ok(_) => json!({ "success": true, "path": display_path(&target) }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

pub fn rename(old_path: &Path, new_name: &str) -> Value {
    let Some(name) = validate_filename(new_name, None) else {
        return json!({ "error": "Invalid name." });
    };
    let Some(parent) = old_path.parent() else {
        return json!({ "error": "Invalid path." });
    };
    let target = parent.join(&name);
    if target.exists() {
        return json!({ "error": "An item with that name already exists." });
    }
    match std::fs::rename(old_path, &target) {
        Ok(_) => json!({
            "success": true,
            "old_path": display_path(old_path),
            "new_path": display_path(&target)
        }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

pub fn delete(path: &Path) -> Value {
    if !path.exists() {
        return json!({ "error": "Item not found." });
    }
    match trash::delete(path) {
        Ok(_) => json!({ "success": true, "path": display_path(path) }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

pub fn duplicate(path: &Path) -> Value {
    if !path.is_file() {
        return json!({ "error": "File not found." });
    }
    let parent = path.parent().unwrap_or(Path::new("."));
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    let mut candidate = parent.join(format!("{stem} (copy){ext}"));
    let mut counter = 1;
    while candidate.exists() {
        counter += 1;
        candidate = parent.join(format!("{stem} (copy {counter}){ext}"));
    }

    match std::fs::copy(path, &candidate) {
        Ok(_) => json!({
            "success": true,
            "path": display_path(&candidate),
            "name": candidate.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
        }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

pub fn move_item(src: &Path, dest_folder: &Path) -> Value {
    if !src.exists() {
        return json!({ "error": "Source not found." });
    }
    if !dest_folder.is_dir() {
        return json!({ "error": "Destination folder not found." });
    }
    let Some(name) = src.file_name() else {
        return json!({ "error": "Invalid source." });
    };
    let target = dest_folder.join(name);
    if target.exists() {
        return json!({ "error": "Item with same name exists in destination." });
    }
    match std::fs::rename(src, &target) {
        Ok(_) => json!({
            "success": true,
            "old_path": display_path(src),
            "new_path": display_path(&target)
        }),
        Err(e) => {
            // Cross-volume move: fall back to copy + delete.
            if src.is_file() {
                match std::fs::copy(src, &target) {
                    Ok(_) => {
                        let _ = std::fs::remove_file(src);
                        return json!({
                            "success": true,
                            "old_path": display_path(src),
                            "new_path": display_path(&target)
                        });
                    }
                    Err(copy_err) => return json!({ "error": copy_err.to_string() }),
                }
            }
            json!({ "error": e.to_string() })
        }
    }
}

pub fn search_filenames(root: &Path, query: &str, cfg: &ScanConfig) -> Vec<Value> {
    let needle = query.to_lowercase();
    let mut results = Vec::new();
    let walker = walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            if e.depth() == 0 {
                return true;
            }
            !name.starts_with('.') && !cfg.exclude.iter().any(|p| p == name.as_ref())
        });

    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().contains(&needle) {
            continue;
        }
        let full: PathBuf = entry.path().to_path_buf();
        let relative = full
            .strip_prefix(root)
            .map(display_path)
            .unwrap_or_else(|_| display_path(&full));
        results.push(json!({
            "name": name,
            "path": display_path(&full),
            "relative": relative,
        }));
        if results.len() >= 50 {
            break;
        }
    }
    results
}
