//! Path validation — deny-by-default trusted roots model.
//!
//! Any path coming from the webview is only accepted when it lives inside:
//!   * the app data directory,
//!   * the current workspace folder,
//!   * a folder the user explicitly opened (trusted folders),
//!   * a file the user explicitly opened (trusted files) — file access only,
//!   * the `assets` sibling directory of a trusted file — image writes only.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use crate::state::AppState;

pub const MAX_TRUSTED_FILES: usize = 500;
pub const MAX_TRUSTED_FOLDERS: usize = 100;

/// Lexically resolve `.` / `..` without touching the filesystem.
fn normalize_lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::ParentDir => {
                if !out.pop() {
                    out.push(comp.as_os_str());
                }
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[cfg(windows)]
fn plain_path(p: PathBuf) -> PathBuf {
    let text = p.to_string_lossy();
    // `canonicalize` hands back verbatim (`\\?\`) paths. Strip the prefix so the
    // rest of the app (and the webview) only ever sees plain `C:\…` paths.
    let stripped = text
        .strip_prefix(r"\\?\UNC\")
        .map(|rest| format!(r"\\{rest}"))
        .or_else(|| text.strip_prefix(r"\\?\").map(str::to_string))
        .unwrap_or_else(|| text.into_owned());
    PathBuf::from(stripped)
}

#[cfg(not(windows))]
fn plain_path(p: PathBuf) -> PathBuf {
    p
}

/// Canonical absolute path. Windows keeps the real on-disk case because
/// `canonicalize` resolves it; comparisons stay stable without lowercasing.
/// Non-existent tails are resolved through their closest existing ancestor so
/// validation still works for paths that are about to be created.
pub fn real_path(path: &Path) -> PathBuf {
    let abs = if path.is_absolute() {
        normalize_lexical(path)
    } else {
        match std::env::current_dir() {
            Ok(cwd) => normalize_lexical(&cwd.join(path)),
            Err(_) => normalize_lexical(path),
        }
    };

    if let Ok(c) = std::fs::canonicalize(&abs) {
        return plain_path(c);
    }

    // Walk up until something exists, then re-append the missing tail.
    let mut missing: Vec<std::ffi::OsString> = Vec::new();
    let mut cursor = abs.clone();
    loop {
        if let Some(name) = cursor.file_name() {
            missing.push(name.to_os_string());
        }
        match cursor.parent() {
            Some(parent) => {
                if let Ok(c) = std::fs::canonicalize(parent) {
                    let mut result = plain_path(c);
                    for part in missing.iter().rev() {
                        result.push(part);
                    }
                    return result;
                }
                cursor = parent.to_path_buf();
                if cursor.parent().is_none() {
                    break;
                }
            }
            None => break,
        }
    }
    plain_path(abs)
}

pub fn display_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub fn is_within(candidate: &Path, root: &Path) -> bool {
    !root.as_os_str().is_empty() && candidate.starts_with(root)
}

/// Validate a JS supplied path.
pub fn validate_path(
    state: &AppState,
    raw: &str,
    allow_trusted_files: bool,
    allow_trusted_folders: bool,
    allow_trusted_asset_dirs: bool,
    must_exist: bool,
) -> Option<PathBuf> {
    if raw.trim().is_empty() {
        return None;
    }
    let raw_path = Path::new(raw);
    if !raw_path.is_absolute() {
        return None;
    }
    if must_exist && !raw_path.exists() {
        return None;
    }

    let candidate = real_path(raw_path);

    let mut roots: Vec<PathBuf> = vec![state.app_data.clone()];
    if let Some(ws) = state.workspace.lock().ok().and_then(|g| g.clone()) {
        roots.push(ws);
    }
    if allow_trusted_folders {
        if let Ok(folders) = state.trusted_folders.lock() {
            roots.extend(folders.iter().cloned());
        }
    }
    if allow_trusted_asset_dirs {
        if let Ok(files) = state.trusted_files.lock() {
            for file in files.iter() {
                if let Some(parent) = file.parent() {
                    roots.push(real_path(&parent.join("assets")));
                }
            }
        }
    }

    if roots.iter().any(|root| is_within(&candidate, root)) {
        return Some(candidate);
    }

    if allow_trusted_files {
        if let Ok(files) = state.trusted_files.lock() {
            if files.contains(&candidate) {
                return Some(candidate);
            }
        }
    }

    None
}

/// Insert with a hard cap; oldest entries are approximated by arbitrary eviction
/// (same behaviour as the previous Python implementation).
fn capped_insert(set: &mut HashSet<PathBuf>, value: PathBuf, cap: usize) {
    set.insert(value);
    while set.len() > cap {
        let victim = set.iter().next().cloned();
        match victim {
            Some(v) => {
                set.remove(&v);
            }
            None => break,
        }
    }
}

pub fn remember_file(state: &AppState, path: &Path) {
    let real = real_path(path);
    if let Ok(mut files) = state.trusted_files.lock() {
        capped_insert(&mut files, real, MAX_TRUSTED_FILES);
    }
    if let Ok(mut settings) = state.settings.lock() {
        settings.add_recent_file(&path.to_string_lossy());
    }
}

pub fn remember_folder(state: &AppState, path: &Path) {
    let real = real_path(path);
    if let Ok(mut folders) = state.trusted_folders.lock() {
        capped_insert(&mut folders, real, MAX_TRUSTED_FOLDERS);
    }
    if let Ok(mut settings) = state.settings.lock() {
        settings.add_recent_folder(&path.to_string_lossy());
    }
}

pub fn set_workspace(state: &AppState, path: &Path) {
    if let Ok(mut ws) = state.workspace.lock() {
        *ws = Some(real_path(path));
    }
}

pub fn workspace(state: &AppState) -> Option<PathBuf> {
    state.workspace.lock().ok().and_then(|g| g.clone())
}

/// Reject names containing path separators, reserved characters or control chars.
pub fn validate_filename(name: &str, allowed_extensions: Option<&[&str]>) -> Option<String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 255 {
        return None;
    }
    if name.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        return None;
    }
    if name.chars().any(|c| (c as u32) < 0x20) {
        return None;
    }
    if name == "." || name == ".." {
        return None;
    }
    if let Some(exts) = allowed_extensions {
        let ext = Path::new(name)
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
            .unwrap_or_default();
        if !exts.iter().any(|allowed| *allowed == ext) {
            return None;
        }
    }
    Some(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexical_normalization_handles_traversal() {
        let p = normalize_lexical(Path::new("C:/a/b/../c"));
        assert!(p.ends_with("a/c") || p.ends_with("a\\c"));
    }

    #[test]
    fn rejects_separators_in_filenames() {
        assert!(validate_filename("../evil.md", None).is_none());
        assert!(validate_filename("ok.md", None).is_some());
        assert!(validate_filename("evil:name", None).is_none());
    }

    #[test]
    fn extension_allow_list_is_enforced() {
        let exts = [".png", ".jpg"];
        assert!(validate_filename("a.png", Some(&exts)).is_some());
        assert!(validate_filename("a.exe", Some(&exts)).is_none());
    }

    #[cfg(windows)]
    #[test]
    fn real_paths_drop_the_verbatim_prefix() {
        let cwd = std::env::current_dir().expect("cwd");
        let verbatim = PathBuf::from(format!(r"\\?\{}", cwd.display()));
        let normalized = real_path(&verbatim);
        assert!(!normalized.to_string_lossy().starts_with(r"\\?\"));
        assert!(normalized.is_absolute());
    }
}
