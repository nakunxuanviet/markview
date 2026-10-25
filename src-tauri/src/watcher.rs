//! Recursive folder watcher built on `notify` with a 300 ms coalescing window.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::security::display_path;

const IGNORED: &[&str] = &[".git", "__pycache__", "node_modules", ".DS_Store"];

/// Paths the app itself just wrote. Watcher events for these are echoes of our
/// own save and must not surface as "changed on disk" banners.
static SELF_WRITES: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();

fn self_writes() -> &'static Mutex<HashMap<String, Instant>> {
    SELF_WRITES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Canonical key for comparing paths across the frontend, the filesystem and
/// `notify`, which may hand back verbatim (`\\?\`) or differently cased paths.
fn path_key(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    let text = text.strip_prefix("//?/").unwrap_or(&text);
    let text = text.strip_prefix("//./").unwrap_or(text);
    text.to_lowercase()
}

pub fn note_self_write(path: &Path) {
    let Ok(mut writes) = self_writes().lock() else {
        return;
    };
    let now = Instant::now();
    writes.retain(|_, at| now.duration_since(*at) < Duration::from_secs(3));
    writes.insert(path_key(path), now);
}

fn is_self_write(path: &Path) -> bool {
    let Ok(mut writes) = self_writes().lock() else {
        return false;
    };
    let key = path_key(path);
    match writes.get(&key) {
        Some(at) if at.elapsed() < Duration::from_secs(3) => true,
        Some(_) => {
            writes.remove(&key);
            false
        }
        None => false,
    }
}

pub struct WatcherHandle {
    // Held only to keep the OS watcher alive.
    _watcher: RecommendedWatcher,
    stop: Arc<AtomicBool>,
}

impl Drop for WatcherHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

fn should_ignore(path: &Path) -> bool {
    path.components().any(|c| {
        let part = c.as_os_str().to_string_lossy();
        part.starts_with('.') || IGNORED.contains(&part.as_ref())
    })
}

fn collect(event: Event, pending: &mut HashMap<(String, String), Value>) {
    let kind = match event.kind {
        EventKind::Create(_) => "created",
        EventKind::Remove(_) => "deleted",
        EventKind::Modify(notify::event::ModifyKind::Name(_)) => "moved",
        EventKind::Modify(_) => "modified",
        _ => return,
    };

    for path in event.paths {
        if should_ignore(&path) {
            continue;
        }
        let is_dir = path.is_dir();
        let payload = json!({
            "type": kind,
            "path": display_path(&path),
            "is_directory": is_dir,
        });
        pending.insert((kind.to_string(), display_path(&path)), payload);
    }
}

pub fn start(app: AppHandle, root: PathBuf) -> Result<WatcherHandle, String> {
    let (tx, rx) = channel();
    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();

    std::thread::spawn(move || {
        let mut pending: HashMap<(String, String), Value> = HashMap::new();
        let mut last_event = Instant::now();

        loop {
            if stop_thread.load(Ordering::Relaxed) {
                break;
            }
            match rx.recv_timeout(Duration::from_millis(120)) {
                Ok(Ok(event)) => {
                    collect(event, &mut pending);
                    last_event = Instant::now();
                }
                Ok(Err(_)) => {}
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }

            if !pending.is_empty() && last_event.elapsed() >= Duration::from_millis(300) {
                for (_, payload) in pending.drain() {
                    // Our own writes are noticed by `notify` before `save_file`
                    // gets a chance to mark them, so filter when the coalescing
                    // window closes rather than when the raw event arrives.
                    let path = payload
                        .get("path")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if is_self_write(Path::new(path)) {
                        continue;
                    }
                    let _ = app.emit("fs-event", payload);
                }
            }
        }
    });

    Ok(WatcherHandle {
        _watcher: watcher,
        stop,
    })
}
