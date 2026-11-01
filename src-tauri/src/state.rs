//! Global application state shared by all Tauri commands.

use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::Mutex;

use crate::prefs::{SessionStore, SettingsStore};
use crate::security::{real_path, MAX_TRUSTED_FILES, MAX_TRUSTED_FOLDERS};
use crate::watcher::WatcherHandle;

/// Bounded LRU set of paths the user has explicitly opened. Keeping recency
/// means a file that is still being edited is not evicted before an older
/// recent entry.
pub struct TrustedPaths {
    set: HashSet<PathBuf>,
    order: VecDeque<PathBuf>,
    cap: usize,
}

impl TrustedPaths {
    pub fn new(cap: usize) -> Self {
        Self {
            set: HashSet::new(),
            order: VecDeque::new(),
            cap,
        }
    }

    pub fn from_paths(paths: impl IntoIterator<Item = PathBuf>, cap: usize) -> Self {
        let mut value = Self::new(cap);
        for path in paths {
            value.insert(path);
        }
        value
    }

    pub fn insert(&mut self, path: PathBuf) {
        self.set.insert(path.clone());
        self.order.retain(|item| item != &path);
        self.order.push_back(path);
        while self.set.len() > self.cap {
            let Some(victim) = self.order.pop_front() else {
                break;
            };
            self.set.remove(&victim);
        }
    }

    pub fn contains(&self, path: &Path) -> bool {
        self.set.contains(path)
    }

    pub fn iter(&self) -> impl Iterator<Item = &PathBuf> {
        self.set.iter()
    }
}

pub struct AppState {
    pub app_data: PathBuf,
    pub settings: Mutex<SettingsStore>,
    pub session: Mutex<SessionStore>,
    pub workspace: Mutex<Option<PathBuf>>,
    pub trusted_files: Mutex<TrustedPaths>,
    pub trusted_folders: Mutex<TrustedPaths>,
    pub watcher: Mutex<Option<WatcherHandle>>,
    /// File passed on the command line by Explorer / a file association.
    pub launch_file: Mutex<Option<PathBuf>>,
    /// Latest search request id; older workers abort when it changes.
    pub search_request: AtomicU64,
    /// Close handshake: the first close request asks the webview to flush its
    /// session; `allow_close` is set by `confirm_close` (or the timeout
    /// fallback) so the second CloseRequested can proceed.
    pub allow_close: AtomicBool,
    pub close_requested: AtomicBool,
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

        let trusted_files = TrustedPaths::from_paths(
            settings
                .get_str_list("recent_files")
                .iter()
                .rev()
                .filter(|p| !p.is_empty())
                .map(|p| real_path(Path::new(p))),
            MAX_TRUSTED_FILES,
        );

        let trusted_folders = TrustedPaths::from_paths(
            settings
                .get_str_list("recent_folders")
                .iter()
                .rev()
                .filter(|p| !p.is_empty())
                .map(|p| real_path(Path::new(p))),
            MAX_TRUSTED_FOLDERS,
        );

        Self {
            app_data,
            settings: Mutex::new(settings),
            session: Mutex::new(session),
            workspace: Mutex::new(None),
            trusted_files: Mutex::new(trusted_files),
            trusted_folders: Mutex::new(trusted_folders),
            watcher: Mutex::new(None),
            launch_file: Mutex::new(None),
            search_request: AtomicU64::new(0),
            allow_close: AtomicBool::new(false),
            close_requested: AtomicBool::new(false),
        }
    }
}
