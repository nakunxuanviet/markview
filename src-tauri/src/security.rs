//! Path validation — deny-by-default trusted roots model.
//!
//! Any path coming from the webview is only accepted when it lives inside:
//!   * the app data directory,
//!   * the current workspace folder,
//!   * a folder the user explicitly opened (trusted folders),
//!   * a file the user explicitly opened (trusted files) — file access only,
//!   * the `assets` sibling directory of a trusted file — image writes only.

use std::path::{Component, Path, PathBuf};

use crate::state::AppState;

pub const MAX_TRUSTED_FILES: usize = 4096;
pub const MAX_TRUSTED_FOLDERS: usize = 512;

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

fn is_device_path(path: &Path) -> bool {
    let text = path.to_string_lossy();
    text.starts_with(r"\\?\") || text.starts_with(r"\\.\")
}

fn starts_with_double_separator(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() >= 2 && matches!(bytes[0], b'/' | b'\\') && matches!(bytes[1], b'/' | b'\\')
}

/// Protocol-relative and mixed-separator forms are never produced by a native
/// Windows dialog. Backslash UNC (`\\server\share`) is left to the trusted-root
/// check so network folders opened by the user keep working.
fn starts_with_forward_or_mixed_separator(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() >= 2
        && ((bytes[0] == b'/' && matches!(bytes[1], b'/' | b'\\'))
            || (bytes[0] == b'\\' && bytes[1] == b'/'))
}

fn is_unc_path(path: &Path) -> bool {
    starts_with_double_separator(&path.to_string_lossy())
}

/// Case-insensitive normalized key used only for the pre-canonicalization UNC
/// check. Windows share names and paths are case-insensitive, and the webview
/// may spell the same share differently from the canonical trusted root.
fn normalized_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

fn is_within_unc(candidate: &Path, root: &Path) -> bool {
    let candidate = normalized_key(candidate);
    let root = normalized_key(root);
    !root.is_empty() && (candidate == root || candidate.starts_with(&format!("{root}/")))
}

fn is_same_unc(candidate: &Path, file: &Path) -> bool {
    normalized_key(candidate) == normalized_key(file)
}

/// An image write/read is allowed when it lives under an `assets` directory
/// whose parent also contains a trusted document. This replaces scanning every
/// trusted file and canonicalizing its `assets` sibling on every image
/// request, which was O(trusted files) filesystem calls per image.
fn is_assets_sibling_of_trusted_file(state: &AppState, candidate: &Path) -> bool {
    let mut dir = Some(candidate);
    while let Some(current) = dir {
        if current.file_name().and_then(|name| name.to_str()) == Some("assets") {
            let Some(document_dir) = current.parent() else {
                return false;
            };
            let Ok(files) = state.trusted_files.lock() else {
                return false;
            };
            return files.iter().any(|file| file.parent() == Some(document_dir));
        }
        dir = current.parent();
    }
    false
}

/// Paths that must never be accepted directly from the webview. Forward-slash
/// UNC paths (`//host/share`) are treated as network-path references by
/// browsers/HTML and can trigger an SMB authentication attempt before any
/// trusted-root check; device paths are never valid document paths.
pub fn is_webview_unsafe_path(raw: &str) -> bool {
    let text = raw.trim_start();
    starts_with_forward_or_mixed_separator(text)
        || text.starts_with(r"\\?\")
        || text.starts_with(r"\\.\")
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
    if is_device_path(raw_path) {
        return None;
    }

    // Build the cheap roots before touching the filesystem so a malicious
    // `//host/share` path cannot make `exists()`/`canonicalize()` open an SMB
    // connection. A UNC path is only allowed when the user already opened a
    // UNC workspace/trusted folder.
    let mut roots: Vec<PathBuf> = vec![state.app_data.clone()];
    if let Some(ws) = state.workspace.lock().ok().and_then(|g| g.clone()) {
        roots.push(ws);
    }
    if allow_trusted_folders {
        if let Ok(folders) = state.trusted_folders.lock() {
            roots.extend(folders.iter().cloned());
        }
    }
    if is_unc_path(raw_path) {
        let lexical = normalize_lexical(raw_path);
        let mut allowed = roots.iter().any(|root| is_within_unc(&lexical, root));
        if !allowed {
            if let Ok(files) = state.trusted_files.lock() {
                allowed = files.iter().any(|file| {
                    (allow_trusted_files && is_same_unc(&lexical, file))
                        || (allow_trusted_asset_dirs
                            && file.parent().is_some_and(|parent| {
                                is_within_unc(&lexical, &parent.join("assets"))
                            }))
                });
            }
        }
        if !allowed {
            return None;
        }
    }

    if must_exist && !raw_path.exists() {
        return None;
    }

    let candidate = real_path(raw_path);

    if roots.iter().any(|root| is_within(&candidate, root)) {
        return Some(candidate);
    }

    if allow_trusted_asset_dirs && is_assets_sibling_of_trusted_file(state, &candidate) {
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

pub fn remember_file(state: &AppState, path: &Path) {
    let real = real_path(path);
    if let Ok(mut files) = state.trusted_files.lock() {
        files.insert(real);
    }
    if let Ok(mut settings) = state.settings.lock() {
        let _ = settings.add_recent_file(&display_path(path));
    }
}

pub fn remember_folder(state: &AppState, path: &Path) {
    let real = real_path(path);
    if let Ok(mut folders) = state.trusted_folders.lock() {
        folders.insert(real);
    }
    if let Ok(mut settings) = state.settings.lock() {
        let _ = settings.add_recent_folder(&display_path(path));
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

    #[test]
    fn rejects_webview_unc_and_device_paths() {
        assert!(is_webview_unsafe_path("//server/share/file.md"));
        assert!(is_webview_unsafe_path(r"\\?\C:\secret"));
        assert!(is_webview_unsafe_path(r"\\.\pipe\name"));
        assert!(is_webview_unsafe_path(r"\/server/share/file.md"));
        assert!(is_webview_unsafe_path(r"/\server/share/file.md"));
        // A Windows dialog returns UNC paths with backslashes; those are
        // allowed to reach validate_path, which checks trusted roots.
        assert!(!is_webview_unsafe_path(r"\\server\share\file.md"));
        assert!(!is_webview_unsafe_path(r"C:\notes\file.md"));
    }

    #[test]
    fn unc_roots_are_compared_case_insensitively() {
        assert!(is_within_unc(
            Path::new(r"\\SERVER\Share\notes\a.md"),
            Path::new(r"\\server\share")
        ));
        assert!(!is_within_unc(
            Path::new(r"\\server\share-other\a.md"),
            Path::new(r"\\server\share")
        ));
    }

    #[test]
    fn trusted_paths_are_evicted_in_lru_order() {
        use crate::state::TrustedPaths;

        let mut set = TrustedPaths::new(3);
        let file0 = PathBuf::from("C:/file-0.md");
        let file1 = PathBuf::from("C:/file-1.md");
        let file3 = PathBuf::from("C:/file-3.md");
        set.insert(file0.clone());
        set.insert(file1.clone());
        set.insert(PathBuf::from("C:/file-2.md"));
        // Touch file-0 so file-1 becomes the oldest entry.
        set.insert(file0.clone());
        set.insert(file3.clone());
        assert!(set.contains(&file0));
        assert!(!set.contains(&file1));
        assert!(set.contains(&file3));
        assert_eq!(set.iter().count(), 3);
    }

    #[test]
    fn assets_directory_is_allowed_for_a_trusted_document() {
        use crate::state::AppState;

        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0);
        let root =
            std::env::temp_dir().join(format!("markview-assets-{}-{stamp}", std::process::id()));
        let assets = root.join("assets");
        std::fs::create_dir_all(&assets).expect("assets dir");
        let state = AppState::new(root.join("app-data"));
        let doc = root.join("doc.md");
        state
            .trusted_files
            .lock()
            .expect("trusted")
            .insert(real_path(&doc));

        assert!(is_assets_sibling_of_trusted_file(&state, &assets));
        assert!(is_assets_sibling_of_trusted_file(
            &state,
            &assets.join("img.png")
        ));
        assert!(!is_assets_sibling_of_trusted_file(
            &state,
            &root.join("other").join("img.png")
        ));
        let _ = std::fs::remove_dir_all(root);
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
