//! File read/write with encoding detection, line-ending metadata and
//! size/binary guards.

use std::io::Read;
use std::path::Path;

use serde_json::{json, Value};

use crate::security::display_path;

pub const MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024;

struct Decoded {
    text: String,
    encoding: String,
    bom: bool,
    line_ending: &'static str,
    mixed_line_endings: bool,
}

fn detect_line_ending(text: &str) -> (&'static str, bool) {
    let mut crlf = 0usize;
    let mut lf = 0usize;
    let mut cr = 0usize;
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' => {
                if i + 1 < bytes.len() && bytes[i + 1] == b'\n' {
                    crlf += 1;
                    i += 2;
                    continue;
                }
                cr += 1;
            }
            b'\n' => lf += 1,
            _ => {}
        }
        i += 1;
    }
    let kinds = [crlf, lf, cr].iter().filter(|n| **n > 0).count();
    let line_ending = if crlf >= lf && crlf >= cr && crlf > 0 {
        "crlf"
    } else if cr > lf && cr > 0 {
        "cr"
    } else {
        "lf"
    };
    (line_ending, kinds > 1)
}

fn normalize_newlines(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn canonical_label(name: &str) -> String {
    match name.to_ascii_lowercase().as_str() {
        "utf-8" => "UTF-8".to_string(),
        "windows-1252" => "Windows-1252".to_string(),
        "shift_jis" => "Shift_JIS".to_string(),
        _ => name.to_string(),
    }
}

fn decode_bytes(raw: &[u8]) -> Decoded {
    let (text, encoding, bom) = if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        (
            String::from_utf8_lossy(&raw[3..]).into_owned(),
            "UTF-8 BOM".to_string(),
            true,
        )
    } else if raw.starts_with(&[0xFF, 0xFE]) {
        let (text, _, _) = encoding_rs::UTF_16LE.decode(raw);
        (text.into_owned(), "UTF-16 LE".to_string(), true)
    } else if raw.starts_with(&[0xFE, 0xFF]) {
        let (text, _, _) = encoding_rs::UTF_16BE.decode(raw);
        (text.into_owned(), "UTF-16 BE".to_string(), true)
    } else if let Ok(text) = std::str::from_utf8(raw) {
        (text.to_string(), "UTF-8".to_string(), false)
    } else {
        // Sniff the legacy encoding.
        let mut detector = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
        detector.feed(raw, true);
        let encoding = detector.guess(None, chardetng::Utf8Detection::Allow);
        let (text, _, _) = encoding.decode(raw);
        (text.into_owned(), canonical_label(encoding.name()), false)
    };

    let (line_ending, mixed_line_endings) = detect_line_ending(&text);
    Decoded {
        text: normalize_newlines(&text),
        encoding,
        bom,
        line_ending,
        mixed_line_endings,
    }
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

    let decoded = decode_bytes(&raw);
    let filename = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    json!({
        "content": decoded.text,
        "encoding": decoded.encoding,
        "bom": decoded.bom,
        "line_ending": decoded.line_ending,
        "mixed_line_endings": decoded.mixed_line_endings,
        "size": size,
        "path": display_path(path),
        "filename": filename,
    })
}

fn utf16_bytes(text: &str, little_endian: bool) -> Vec<u8> {
    let mut out = Vec::with_capacity(text.len() * 2);
    for unit in text.encode_utf16() {
        if little_endian {
            out.extend_from_slice(&unit.to_le_bytes());
        } else {
            out.extend_from_slice(&unit.to_be_bytes());
        }
    }
    out
}

fn encode_text(
    text: &str,
    encoding: Option<&str>,
    bom: Option<bool>,
    line_ending: Option<&str>,
) -> Result<(Vec<u8>, String, bool, String), Value> {
    let line_ending = match line_ending.unwrap_or("lf") {
        "crlf" => "crlf",
        "cr" => "cr",
        _ => "lf",
    };
    let normalized = normalize_newlines(text);
    let with_eol = match line_ending {
        "crlf" => normalized.replace('\n', "\r\n"),
        "cr" => normalized.replace('\n', "\r"),
        _ => normalized,
    };

    let label = encoding.unwrap_or("UTF-8").to_ascii_lowercase();
    let (bytes, canonical, bom_default) = match label.as_str() {
        "utf-8" => (with_eol.into_bytes(), "UTF-8".to_string(), false),
        "utf-8 bom" | "utf-8 with bom" | "utf-8-sig" => {
            (with_eol.into_bytes(), "UTF-8 BOM".to_string(), true)
        }
        "utf-16 le" | "utf-16" => (utf16_bytes(&with_eol, true), "UTF-16 LE".to_string(), true),
        "utf-16 be" => (utf16_bytes(&with_eol, false), "UTF-16 BE".to_string(), true),
        _ => match encoding_rs::Encoding::for_label(label.as_bytes()) {
            Some(encoder) => {
                let (bytes, _, had_errors) = encoder.encode(&with_eol);
                if had_errors {
                    return Err(json!({
                        "error": "encoding",
                        "message": format!(
                            "Some characters cannot be represented in {}. Choose UTF-8 or UTF-16.",
                            encoder.name()
                        ),
                        "encoding": encoder.name(),
                    }));
                }
                (bytes.into_owned(), canonical_label(encoder.name()), false)
            }
            None => {
                return Err(json!({
                    "error": "encoding",
                    "message": format!("Unknown encoding: {encoding:?}")
                }))
            }
        },
    };

    let want_bom = bom.unwrap_or(bom_default);
    let mut out = Vec::with_capacity(bytes.len() + 3);
    if want_bom {
        match canonical.as_str() {
            "UTF-8 BOM" => out.extend_from_slice(&[0xEF, 0xBB, 0xBF]),
            "UTF-16 LE" => out.extend_from_slice(&[0xFF, 0xFE]),
            "UTF-16 BE" => out.extend_from_slice(&[0xFE, 0xFF]),
            _ => {}
        }
    }
    out.extend_from_slice(&bytes);
    Ok((out, canonical, want_bom, line_ending.to_string()))
}

pub fn write_file_data(
    path: &Path,
    content: &str,
    encoding: Option<&str>,
    bom: Option<bool>,
    line_ending: Option<&str>,
) -> Value {
    let (bytes, encoding, bom, line_ending) = match encode_text(content, encoding, bom, line_ending)
    {
        Ok(value) => value,
        Err(error) => return error,
    };

    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return json!({ "error": format!("Save failed: {e}") });
            }
        }
    }

    let mut tmp = path.to_path_buf();
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    tmp.set_file_name(format!("{file_name}.tmp"));
    if let Err(e) = std::fs::write(&tmp, bytes) {
        let message = if e.kind() == std::io::ErrorKind::PermissionDenied {
            "Permission denied. Try Save As to a different location.".to_string()
        } else {
            format!("Save failed: {e}")
        };
        return json!({ "error": message });
    }
    if let Err(e) = std::fs::rename(&tmp, path) {
        let _ = std::fs::remove_file(&tmp);
        return json!({ "error": format!("Save failed: {e}") });
    }

    json!({
        "success": true,
        "path": display_path(path),
        "encoding": encoding,
        "bom": bom,
        "line_ending": line_ending,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> std::path::PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!(
            "markview-enc-{name}-{}-{stamp}.md",
            std::process::id()
        ))
    }

    #[test]
    fn detects_bom_and_crlf() {
        let decoded = decode_bytes(b"\xEF\xBB\xBFa\r\nb\r\n");
        assert_eq!(decoded.text, "a\nb\n");
        assert_eq!(decoded.encoding, "UTF-8 BOM");
        assert!(decoded.bom);
        assert_eq!(decoded.line_ending, "crlf");
        assert!(!decoded.mixed_line_endings);
    }

    #[test]
    fn roundtrips_utf16le_with_bom_and_crlf() {
        let path = temp_path("utf16");
        let result = write_file_data(
            &path,
            "héllo\nworld\n",
            Some("UTF-16 LE"),
            Some(true),
            Some("crlf"),
        );
        assert_eq!(result["success"], true);
        let read = read_file_data(&path);
        assert_eq!(read["encoding"].as_str(), Some("UTF-16 LE"));
        assert_eq!(read["bom"].as_bool(), Some(true));
        assert_eq!(read["line_ending"].as_str(), Some("crlf"));
        assert_eq!(read["content"].as_str(), Some("héllo\nworld\n"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_characters_missing_from_legacy_encoding() {
        let path = temp_path("sjis");
        let result = write_file_data(&path, "😀", Some("Shift_JIS"), Some(false), Some("lf"));
        assert_eq!(result["error"].as_str(), Some("encoding"));
        assert!(!path.exists());
    }
}
