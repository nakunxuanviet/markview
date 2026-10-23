//! File read/write with encoding detection and size/binary guards.

use std::io::Read;
use std::path::Path;

use serde_json::{json, Value};

use crate::security::display_path;

pub const MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024;

fn decode_bytes(raw: &[u8]) -> (String, &'static str) {
    // UTF-8 BOM
    if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return (
            String::from_utf8_lossy(&raw[3..]).into_owned(),
            "UTF-8 with BOM",
        );
    }
    // UTF-16 BOMs
    if raw.starts_with(&[0xFF, 0xFE]) {
        let (text, _, _) = encoding_rs::UTF_16LE.decode(raw);
        return (text.into_owned(), "UTF-16 LE");
    }
    if raw.starts_with(&[0xFE, 0xFF]) {
        let (text, _, _) = encoding_rs::UTF_16BE.decode(raw);
        return (text.into_owned(), "UTF-16 BE");
    }
    if let Ok(text) = std::str::from_utf8(raw) {
        return (text.to_string(), "UTF-8");
    }

    // Sniff the legacy encoding.
    let mut detector = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
    detector.feed(raw, true);
    let encoding = detector.guess(None, chardetng::Utf8Detection::Allow);
    let (text, _, _) = encoding.decode(raw);
    (text.into_owned(), encoding.name())
}

pub fn read_file_data(path: &Path) -> Value {
    if !path.is_file() {
        return json!({ "error": format!("File not found: {}", display_path(path)) });
    }

    let metadata = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(e) => return json!({ "error": e.to_string() }),
    };
    let size = metadata.len();
    if size > MAX_FILE_SIZE_BYTES {
        return json!({
            "error": format!(
                "File is too large ({:.1} MB). Maximum supported size is {} MB.",
                size as f64 / (1024.0 * 1024.0),
                MAX_FILE_SIZE_BYTES / (1024 * 1024)
            )
        });
    }

    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) => return json!({ "error": e.to_string() }),
    };
    let mut raw = Vec::with_capacity(size as usize);
    if let Err(e) = file.read_to_end(&mut raw) {
        return json!({ "error": e.to_string() });
    }

    let head_len = raw.len().min(1024);
    if raw[..head_len].contains(&0)
        && !raw.starts_with(&[0xFF, 0xFE])
        && !raw.starts_with(&[0xFE, 0xFF])
    {
        return json!({ "error": "Binary file cannot be opened" });
    }

    let (content, encoding) = decode_bytes(&raw);
    let filename = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    json!({
        "content": content,
        "encoding": encoding,
        "size": size,
        "path": display_path(path),
        "filename": filename,
    })
}

pub fn write_file_data(path: &Path, content: &str) -> Value {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return json!({ "error": format!("Save failed: {e}") });
            }
        }
    }
    match std::fs::write(path, content.as_bytes()) {
        Ok(_) => json!({ "success": true, "path": display_path(path) }),
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => json!({
            "error": "Permission denied. Try Save As to a different location."
        }),
        Err(e) => json!({ "error": format!("Save failed: {e}") }),
    }
}
