//! Global application state shared by all Tauri commands.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::prefs::{SessionStore, SettingsStore};
use crate::security::real_path;
use crate::watcher::WatcherHandle;

pub struct AppState {
    pub app_data: PathBuf,
    pub settings: Mutex<SettingsStore>,
    pub session: Mutex<SessionStore>,
    pub workspace: Mutex<Option<PathBuf>>,
    pub trusted_files: Mutex<HashSet<PathBuf>>,
    pub trusted_folders: Mutex<HashSet<PathBuf>>,
    pub watcher: Mutex<Option<WatcherHandle>>,
    /// File passed on the command line by Explorer / a file association.
    pub launch_file: Mutex<Option<PathBuf>>,
}

/// Mirrors the Python implementation: `%APPDATA%\MarkView`, so an existing
/// install keeps its settings and session.
pub fn app_data_dir() -> PathBuf {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("markview")
    }
    #[cfg(not(all(unix, not(target_os = "macos"))))]
    {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("MarkView")
    }
}

impl AppState {
    pub fn new(app_data: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&app_data);
        let settings = SettingsStore::new(&app_data);
        let session = SessionStore::new(&app_data);

        let trusted_files: HashSet<PathBuf> = settings
            .get_str_list("recent_files")
            .iter()
            .filter(|p| !p.is_empty())
            .map(|p| real_path(Path::new(p)))
            .collect();

        let trusted_folders: HashSet<PathBuf> = settings
            .get_str_list("recent_folders")
            .iter()
            .filter(|p| !p.is_empty())
            .map(|p| real_path(Path::new(p)))
            .collect();

        Self {
            app_data,
            settings: Mutex::new(settings),
            session: Mutex::new(session),
            workspace: Mutex::new(None),
            trusted_files: Mutex::new(trusted_files),
            trusted_folders: Mutex::new(trusted_folders),
            watcher: Mutex::new(None),
            launch_file: Mutex::new(None),
        }
    }
}
