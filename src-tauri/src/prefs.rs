//! Settings + session persistence (JSON, in the app data directory).

use std::path::{Path, PathBuf};

use serde_json::{json, Value};

pub fn default_settings() -> Value {
    json!({
        "appearance": {
            "theme": "dark",
            "font_family_editor": "JetBrains Mono, Consolas, monospace",
            "font_family_preview": "Segoe UI, system-ui, sans-serif",
            "font_size_editor": 14,
            "font_size_preview": 15,
            "zoom_level": 1.0,
            "sidebar_width": 250,
            "sidebar_visible": true,
            "preview_visible": true,
            "preview_position": "right",
            "show_toolbar": true,
            "show_statusbar": true,
            "show_line_numbers": true,
            "show_minimap": false
        },
        "editor": {
            "word_wrap": true,
            "tab_size": 4,
            "insert_spaces": true,
            "auto_close_brackets": true,
            "auto_indent": true,
            "highlight_active_line": true,
            "match_brackets": true,
            "code_folding": false
        },
        "files": {
            "auto_save": false,
            "auto_save_interval": 30,
            "default_encoding": "utf-8",
            "default_line_ending": "lf",
            "visible_extensions": [".md", ".markdown", ".mdx", ".txt", ".xlsx", ".xls", ".docx", ".doc", ".pdf", ".pptx", ".csv"],
            "show_hidden_files": false,
            "sort_by": "name_asc",
            "folders_first": true,
            "folder_label_segments": 2,
            "exclude_patterns": ["node_modules", ".git", "__pycache__", ".DS_Store"]
        },
        "session": {
            "restore_session": true,
            "backup_interval": 10,
            "remember_folder": true
        },
        "preview": {
            "scroll_sync": true,
            "render_mermaid": true,
            "render_math": true,
            "double_click_preview": true,
            "code_theme": "github-dark"
        },
        "recent_files": [],
        "recent_folders": [],
        "pinned_folders": [],
        "language": "en",
        "window": { "width": 1280, "height": 800, "x": 100, "y": 50, "maximized": false }
    })
}

pub fn deep_merge(base: &mut Value, overrides: &Value) {
    match (base, overrides) {
        (Value::Object(base_map), Value::Object(over_map)) => {
            for (key, value) in over_map {
                match base_map.get_mut(key) {
                    Some(existing) if existing.is_object() && value.is_object() => {
                        deep_merge(existing, value)
                    }
                    _ => {
                        base_map.insert(key.clone(), value.clone());
                    }
                }
            }
        }
        (base_slot, value) => *base_slot = value.clone(),
    }
}

pub fn get_path<'a>(value: &'a Value, dotted: &str) -> Option<&'a Value> {
    let mut cursor = value;
    for key in dotted.split('.') {
        cursor = cursor.get(key)?;
    }
    Some(cursor)
}

pub struct SettingsStore {
    path: PathBuf,
    value: Value,
}

impl SettingsStore {
    pub fn new(app_data: &Path) -> Self {
        let path = app_data.join("settings.json");
        let mut value = default_settings();
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
                deep_merge(&mut value, &parsed);
            }
        }
        Self { path, value }
    }

    pub fn all(&self) -> Value {
        self.value.clone()
    }

    pub fn get(&self, dotted: &str) -> Option<&Value> {
        get_path(&self.value, dotted)
    }

    pub fn get_str_list(&self, dotted: &str) -> Vec<String> {
        self.get(dotted)
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn get_string_list_or(&self, dotted: &str, fallback: &[&str]) -> Vec<String> {
        let list = self.get_str_list(dotted);
        if list.is_empty() {
            fallback.iter().map(|s| s.to_string()).collect()
        } else {
            list
        }
    }

    pub fn get_bool_or(&self, dotted: &str, fallback: bool) -> bool {
        self.get(dotted)
            .and_then(|v| v.as_bool())
            .unwrap_or(fallback)
    }

    pub fn update(&mut self, patch: &Value) {
        deep_merge(&mut self.value, patch);
        self.save();
    }

    pub fn add_recent_file(&mut self, path: &str) {
        add_recent(&mut self.value, "recent_files", path, 20);
        self.save();
    }

    pub fn add_recent_folder(&mut self, path: &str) {
        add_recent(&mut self.value, "recent_folders", path, 10);
        self.save();
    }

    fn save(&self) {
        if let Ok(text) = serde_json::to_string_pretty(&self.value) {
            let _ = std::fs::write(&self.path, text);
        }
    }
}

fn add_recent(value: &mut Value, key: &str, path: &str, cap: usize) {
    let Some(obj) = value.as_object_mut() else {
        return;
    };
    let entry = obj
        .entry(key.to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(arr) = entry.as_array_mut() else {
        return;
    };
    arr.retain(|v| v.as_str() != Some(path));
    arr.insert(0, Value::String(path.to_string()));
    arr.truncate(cap);
}

pub struct SessionStore {
    session_path: PathBuf,
    backup_dir: PathBuf,
}

impl SessionStore {
    pub fn new(app_data: &Path) -> Self {
        let backup_dir = app_data.join("backup");
        let _ = std::fs::create_dir_all(&backup_dir);
        Self {
            session_path: app_data.join("session.json"),
            backup_dir,
        }
    }

    fn backup_path(&self, tab_id: &str) -> PathBuf {
        let safe: String = tab_id
            .chars()
            .map(|c| if c == '/' || c == '\\' { '_' } else { c })
            .collect();
        self.backup_dir.join(format!("{safe}.md"))
    }

    pub fn write_backup(&self, tab_id: &str, content: &str) -> bool {
        let path = self.backup_path(tab_id);
        let tmp = path.with_extension("md.tmp");
        if std::fs::write(&tmp, content).is_err() {
            return false;
        }
        if std::fs::rename(&tmp, &path).is_err() {
            let _ = std::fs::remove_file(&tmp);
            return false;
        }
        true
    }

    fn read_backup(&self, tab_id: &str) -> Option<String> {
        std::fs::read_to_string(self.backup_path(tab_id)).ok()
    }

    fn read_session_raw(&self) -> Option<Value> {
        let raw = std::fs::read_to_string(&self.session_path).ok()?;
        serde_json::from_str(&raw).ok()
    }

    /// Session v2: `content` is present only for tabs that changed since the
    /// previous backup. Metadata is merged over the existing session so tabs
    /// without content keep their previous backup on disk.
    pub fn save_merged(&self, data: &Value) -> bool {
        let payload_version = data.get("version").and_then(Value::as_u64);
        if payload_version != Some(2) {
            return self.save(data);
        }

        let Some(payload) = data.as_object() else {
            return false;
        };
        let Some(payload_tabs) = payload.get("tabs").and_then(Value::as_object) else {
            return false;
        };

        let existing = self.read_session_raw().unwrap_or_else(|| json!({}));
        let old_tabs = existing
            .get("tabs")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();

        let mut merged_tabs = serde_json::Map::new();
        let mut backups: Vec<(String, String)> = Vec::new();
        for (tab_id, raw_tab) in payload_tabs {
            let Some(raw_tab) = raw_tab.as_object() else {
                continue;
            };
            let mut merged = old_tabs
                .get(tab_id)
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            for (key, value) in raw_tab {
                if key == "content" {
                    if let Value::String(content) = value {
                        merged.insert("content_len".into(), json!(content.len()));
                        backups.push((tab_id.clone(), content.clone()));
                    }
                    continue;
                }
                merged.insert(key.clone(), value.clone());
            }
            merged_tabs.insert(tab_id.clone(), Value::Object(merged));
        }

        let mut session = existing;
        let Some(session_obj) = session.as_object_mut() else {
            return false;
        };
        let old_meta_hash = session_obj
            .get("meta_hash")
            .and_then(Value::as_str)
            .map(str::to_string);
        let new_meta_hash = payload
            .get("meta_hash")
            .and_then(Value::as_str)
            .map(str::to_string);

        session_obj.insert("version".into(), json!(2));
        session_obj.insert("tabs".into(), Value::Object(merged_tabs));
        for key in [
            "meta_hash",
            "tab_order",
            "active_tab",
            "workspace_folder",
            "sidebar_width",
            "sidebar_collapsed",
        ] {
            if let Some(value) = payload.get(key) {
                session_obj.insert(key.to_string(), value.clone());
            }
        }

        if backups.is_empty() && old_meta_hash == new_meta_hash && new_meta_hash.is_some() {
            return true;
        }

        for (tab_id, content) in &backups {
            if !self.write_backup(tab_id, content) {
                return false;
            }
        }

        let Ok(text) = serde_json::to_string_pretty(&session) else {
            return false;
        };
        let tmp = self.session_path.with_extension("json.tmp");
        if std::fs::write(&tmp, text).is_err() {
            return false;
        }
        if std::fs::rename(&tmp, &self.session_path).is_err() {
            let _ = std::fs::remove_file(&tmp);
            return false;
        }

        // Only prune when there is at least one tab: an empty start-up save
        // must not wipe crash backups before the session is restored.
        let live_ids: std::collections::HashSet<String> = payload
            .get("tab_order")
            .and_then(Value::as_array)
            .map(|ids| {
                ids.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        if !live_ids.is_empty() {
            if let Ok(entries) = std::fs::read_dir(&self.backup_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("md") {
                        continue;
                    }
                    let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                        continue;
                    };
                    if !live_ids.contains(stem) {
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
        }
        true
    }

    pub fn save(&self, data: &Value) -> bool {
        let mut meta = data.clone();
        let Some(obj) = meta.as_object_mut() else {
            return false;
        };

        let mut backups: Vec<(String, String)> = Vec::new();
        if let Some(tabs) = obj.get_mut("tabs").and_then(|t| t.as_object_mut()) {
            for (tab_id, tab) in tabs.iter_mut() {
                if let Some(tab_obj) = tab.as_object_mut() {
                    if let Some(Value::String(content)) = tab_obj.remove("content") {
                        backups.push((tab_id.clone(), content));
                    }
                }
            }
        }

        let Ok(text) = serde_json::to_string_pretty(&meta) else {
            return false;
        };
        if std::fs::write(&self.session_path, text).is_err() {
            return false;
        }
        for (tab_id, content) in &backups {
            self.write_backup(tab_id, content);
        }
        // Prune backups that no longer belong to any tab. Skipped while the
        // session is still empty so a start-up save cannot wipe them.
        if !backups.is_empty() {
            let live: std::collections::HashSet<PathBuf> = backups
                .iter()
                .map(|(tab_id, _)| self.backup_path(tab_id))
                .collect();
            if let Ok(entries) = std::fs::read_dir(&self.backup_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let is_backup = path.extension().and_then(|e| e.to_str()) == Some("md");
                    if is_backup && !live.contains(&path) {
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
        }
        true
    }

    pub fn load(&self) -> Option<Value> {
        if !self.session_path.exists() {
            return None;
        }
        let raw = std::fs::read_to_string(&self.session_path).ok()?;
        let mut session: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => {
                let _ = std::fs::rename(
                    &self.session_path,
                    self.session_path.with_extension("json.bak"),
                );
                return None;
            }
        };

        if let Some(tabs) = session.get_mut("tabs").and_then(|t| t.as_object_mut()) {
            for (tab_id, tab) in tabs.iter_mut() {
                let Some(tab_obj) = tab.as_object_mut() else {
                    continue;
                };
                let path = tab_obj
                    .get("path")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let modified = tab_obj
                    .get("modified")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let disk = || {
                    path.as_deref()
                        .and_then(|p| std::fs::read_to_string(p).ok())
                };
                let content = if modified {
                    self.read_backup(tab_id).or_else(disk)
                } else {
                    // A clean tab should reflect external edits made while the
                    // app was closed; the backup is only a fallback.
                    disk().or_else(|| self.read_backup(tab_id))
                }
                .unwrap_or_default();
                tab_obj.insert("content".to_string(), Value::String(content));
            }
        }
        Some(session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::display_path;
    use serde_json::json;

    fn temp_dir(tag: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "markview-test-{tag}-{}-{stamp}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    fn tab(store: &SessionStore, id: &str) -> String {
        std::fs::read_to_string(store.backup_path(id)).unwrap_or_default()
    }

    #[test]
    fn session_v2_merges_backups_and_prunes_closed_tabs() {
        let dir = temp_dir("session");
        let store = SessionStore::new(&dir);

        let first = json!({
            "version": 2,
            "meta_hash": "h1",
            "tabs": {
                "tab_1": { "path": null, "filename": "a", "modified": true, "content": "one" },
                "tab_2": { "path": null, "filename": "b", "modified": true, "content": "two" }
            },
            "tab_order": ["tab_1", "tab_2"],
            "active_tab": "tab_1",
            "workspace_folder": null
        });
        assert!(store.save_merged(&first));
        assert_eq!(tab(&store, "tab_1"), "one");
        assert_eq!(tab(&store, "tab_2"), "two");

        let second = json!({
            "version": 2,
            "meta_hash": "h2",
            "tabs": {
                "tab_1": { "path": null, "filename": "a", "modified": true, "content": "one+" },
                "tab_2": { "path": null, "filename": "b", "modified": false }
            },
            "tab_order": ["tab_1", "tab_2"],
            "active_tab": "tab_1",
            "workspace_folder": null
        });
        assert!(store.save_merged(&second));
        assert_eq!(tab(&store, "tab_1"), "one+");
        assert_eq!(
            tab(&store, "tab_2"),
            "two",
            "metadata-only save must keep backup"
        );

        let third = json!({
            "version": 2,
            "meta_hash": "h3",
            "tabs": {
                "tab_1": { "path": null, "filename": "a", "modified": false }
            },
            "tab_order": ["tab_1"],
            "active_tab": "tab_1",
            "workspace_folder": null
        });
        assert!(store.save_merged(&third));
        assert!(!store.backup_path("tab_2").exists(), "closed tab pruned");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn clean_tab_restores_from_disk() {
        let dir = temp_dir("restore");
        let store = SessionStore::new(&dir);
        let file = dir.join("doc.md");
        std::fs::write(&file, "disk").expect("write disk");

        let payload = json!({
            "version": 2,
            "meta_hash": "h1",
            "tabs": {
                "tab_1": {
                    "path": display_path(&file),
                    "filename": "doc.md",
                    "modified": false,
                    "content": "backup"
                }
            },
            "tab_order": ["tab_1"],
            "active_tab": "tab_1",
            "workspace_folder": null
        });
        assert!(store.save_merged(&payload));
        std::fs::write(&file, "disk-new").expect("write disk 2");
        let session = store.load().expect("session");
        assert_eq!(
            session["tabs"]["tab_1"]["content"].as_str(),
            Some("disk-new")
        );

        let modified = json!({
            "version": 2,
            "meta_hash": "h2",
            "tabs": {
                "tab_1": {
                    "path": display_path(&file),
                    "filename": "doc.md",
                    "modified": true,
                    "content": "buffer"
                }
            },
            "tab_order": ["tab_1"],
            "active_tab": "tab_1",
            "workspace_folder": null
        });
        assert!(store.save_merged(&modified));
        std::fs::write(&file, "disk-newer").expect("write disk 3");
        let session = store.load().expect("session");
        assert_eq!(session["tabs"]["tab_1"]["content"].as_str(), Some("buffer"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
