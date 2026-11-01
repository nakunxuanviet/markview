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
            "show_toolbar": true,
            "show_statusbar": true,
            "show_line_numbers": true
        },
        "editor": {
            "word_wrap": true,
            "tab_size": 4,
            "insert_spaces": true,
            "auto_close_brackets": true,
            "auto_indent": true,
            "highlight_active_line": true,
            "match_brackets": true,
            "code_folding": false,
            "spellcheck": false
        },
        "files": {
            "auto_save": false,
            "auto_save_interval": 30,
            "default_encoding": "UTF-8",
            "default_line_ending": "lf",
            "visible_extensions": [".md", ".markdown", ".mdx", ".txt"],
            "show_hidden_files": false,
            "folders_first": true,
            "folder_label_segments": 2,
            "exclude_patterns": ["node_modules", ".git", "__pycache__", ".DS_Store"]
        },
        "session": {
            "restore_session": true,
            "backup_interval": 10
        },
        "preview": {
            "scroll_sync": true,
            "render_mermaid": true,
            "render_math": true,
            "double_click_preview": true
        },
        "recent_files": [],
        "recent_folders": [],
        "window": { "width": 1280, "height": 800, "x": 100, "y": 50, "maximized": false }
    })
}

/// Drop settings that no longer have UI or behavior. Leaving them in
/// settings.json would make `deep_merge` resurrect them on every launch.
fn remove_obsolete(value: &mut Value) -> bool {
    let mut changed = false;
    if let Some(object) = value.as_object_mut() {
        for (section, key) in [
            ("appearance", "preview_position"),
            ("appearance", "show_minimap"),
            ("files", "sort_by"),
            ("preview", "code_theme"),
            ("session", "remember_folder"),
        ] {
            if let Some(section) = object.get_mut(section).and_then(Value::as_object_mut) {
                changed |= section.remove(key).is_some();
            }
        }
        changed |= object.remove("language").is_some();
        changed |= object.remove("pinned_folders").is_some();
    }
    changed
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
        let cleaned = remove_obsolete(&mut value);
        let store = Self { path, value };
        if cleaned {
            store.save();
        }
        store
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

    pub fn update(&mut self, patch: &Value) -> bool {
        deep_merge(&mut self.value, patch);
        self.save()
    }

    pub fn add_recent_file(&mut self, path: &str) -> bool {
        add_recent(&mut self.value, "recent_files", path, 20);
        self.save()
    }

    pub fn add_recent_folder(&mut self, path: &str) -> bool {
        add_recent(&mut self.value, "recent_folders", path, 10);
        self.save()
    }

    /// Write through a sibling temp file and rename, so a crash mid-write
    /// cannot leave a truncated settings.json (which would reset every
    /// preference and the recent-file history on the next launch).
    fn save(&self) -> bool {
        let Ok(text) = serde_json::to_string_pretty(&self.value) else {
            return false;
        };
        let tmp = self.path.with_extension("json.tmp");
        if std::fs::write(&tmp, text).is_err() {
            return false;
        }
        if std::fs::rename(&tmp, &self.path).is_err() {
            let _ = std::fs::remove_file(&tmp);
            return false;
        }
        true
    }
}

fn recent_key(path: &str) -> String {
    path.replace('\\', "/").to_lowercase()
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
    let key = recent_key(path);
    arr.retain(|v| v.as_str().map(recent_key).as_deref() != Some(key.as_str()));
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
                let backup = self.read_backup(tab_id);
                // A dirty tab restores from its backup; there is no reason to
                // read (and decode) the on-disk file first.
                let disk_data = if modified && backup.is_some() {
                    None
                } else {
                    path.as_deref().and_then(|p| {
                        let data = crate::files::read_file_data(Path::new(p));
                        if data.get("error").is_none() {
                            Some(data)
                        } else {
                            None
                        }
                    })
                };
                let disk_content = disk_data
                    .as_ref()
                    .and_then(|data| data.get("content"))
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let (content, from_disk) = if modified {
                    if let Some(content) = backup {
                        (content, false)
                    } else {
                        let from_disk = disk_content.is_some();
                        (disk_content.unwrap_or_default(), from_disk)
                    }
                } else if let Some(content) = disk_content {
                    (content, true)
                } else {
                    (backup.unwrap_or_default(), false)
                };
                tab_obj.insert("content".to_string(), Value::String(content));
                if from_disk {
                    if let Some(data) = &disk_data {
                        for key in ["encoding", "bom", "line_ending", "mixed_line_endings"] {
                            if let Some(value) = data.get(key) {
                                tab_obj.insert(key.to_string(), value.clone());
                            }
                        }
                        if let Some(value) = data.get("modified_ms") {
                            tab_obj.insert("disk_modified_ms".to_string(), value.clone());
                        }
                    }
                }
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
    fn settings_updates_are_atomic_and_persist() {
        let dir = temp_dir("settings-atomic");
        let mut store = SettingsStore::new(&dir);
        assert!(store.update(&json!({ "appearance": { "theme": "light" } })));
        assert_eq!(
            store.get("appearance.theme").and_then(Value::as_str),
            Some("light")
        );
        assert!(!dir.join("settings.json.tmp").exists());

        let reloaded = SettingsStore::new(&dir);
        assert_eq!(
            reloaded.get("appearance.theme").and_then(Value::as_str),
            Some("light")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn metadata_only_session_save_is_persisted() {
        let dir = temp_dir("session-meta");
        let store = SessionStore::new(&dir);
        let first = json!({
            "version": 2,
            "meta_hash": "h1",
            "tabs": {
                "tab_1": { "path": null, "filename": "a", "modified": false, "cursor_pos": 1, "scroll_top": 0 }
            },
            "tab_order": ["tab_1"],
            "active_tab": "tab_1"
        });
        assert!(store.save_merged(&first));

        let second = json!({
            "version": 2,
            "meta_hash": "h2",
            "tabs": {
                "tab_1": { "path": null, "filename": "a", "modified": true, "cursor_pos": 7, "scroll_top": 42 }
            },
            "tab_order": ["tab_1"],
            "active_tab": "tab_1"
        });
        assert!(store.save_merged(&second));
        let raw: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.join("session.json")).expect("session"),
        )
        .expect("json");
        assert_eq!(raw["tabs"]["tab_1"]["cursor_pos"], 7);
        assert_eq!(raw["tabs"]["tab_1"]["scroll_top"], 42);
        assert_eq!(raw["tabs"]["tab_1"]["modified"], true);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn clean_utf16_tab_restores_decoded_content() {
        let dir = temp_dir("session-utf16");
        let store = SessionStore::new(&dir);
        let file = dir.join("doc.md");
        let write = crate::files::write_file_data(
            &file,
            "héllo\n",
            Some("UTF-16 LE"),
            Some(true),
            Some("lf"),
        );
        assert_eq!(write["success"], true);

        let payload = json!({
            "version": 2,
            "meta_hash": "h1",
            "tabs": {
                "tab_1": {
                    "path": display_path(&file),
                    "filename": "doc.md",
                    "modified": false
                }
            },
            "tab_order": ["tab_1"],
            "active_tab": "tab_1",
            "workspace_folder": null
        });
        assert!(store.save_merged(&payload));
        let session = store.load().expect("session");
        assert_eq!(
            session["tabs"]["tab_1"]["content"].as_str(),
            Some("héllo\n")
        );
        assert_eq!(
            session["tabs"]["tab_1"]["encoding"].as_str(),
            Some("UTF-16 LE")
        );
        assert_eq!(session["tabs"]["tab_1"]["bom"].as_bool(), Some(true));
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
