//! File read/write with encoding detection, line-ending metadata and
//! size/binary guards.

use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::UNIX_EPOCH;

use serde_json::{json, Value};

use crate::security::display_path;

pub const MAX_FILE_SIZE_BYTES: u64 = 10 * 1024 * 1024;

static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Formats that must never be opened or written as text. The NUL-byte check
/// below is not enough on its own: a simple PDF can be ASCII-only and valid
/// UTF-8 for its first kilobyte, which would otherwise let MarkView show it as
/// an editable document and overwrite it on save.
const BINARY_EXTENSIONS: &[&str] = &[
    "7z", "avi", "avif", "bin", "bmp", "bz2", "class", "doc", "docx", "dll", "dylib", "epub",
    "exe", "flac", "gif", "gz", "ico", "jar", "jpeg", "jpg", "mkv", "mov", "mp3", "mp4", "msi",
    "odp", "ods", "odt", "otf", "pdf", "png", "ppt", "pptx", "psd", "rar", "so", "sqlite", "tar",
    "tif", "tiff", "ttf", "wav", "webp", "woff", "woff2", "xls", "xlsx", "zip",
];

const BINARY_SIGNATURES: &[&[u8]] = &[
    b"%PDF-",
    b"PK\x03\x04", // ZIP: docx/xlsx/pptx/epub
    b"PK\x05\x06",
    b"PK\x07\x08",
    b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1", // Legacy OLE: doc/xls/ppt
    b"\x89PNG\r\n\x1A\n",
    b"\xFF\xD8\xFF", // JPEG
    b"GIF87a",
    b"GIF89a",
    b"RIFF",     // WebP/WAV/AVI
    b"\x1F\x8B", // gzip
    b"7z\xBC\xAF\x27\x1C",
    b"Rar!\x1A\x07",
    b"MZ", // PE executable/DLL
    b"\x7FELF",
];

fn is_binary_path(path: &Path) -> bool {
    path.extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase())
        .is_some_and(|ext| BINARY_EXTENSIONS.iter().any(|known| *known == ext))
}

fn has_binary_signature(bytes: &[u8]) -> bool {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let head = &bytes[..bytes.len().min(1024)];
    BINARY_SIGNATURES
        .iter()
        .any(|signature| head.starts_with(signature))
}

fn modified_ms(meta: &std::fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
}

pub fn modified_ms_for_path(path: &Path) -> Option<u64> {
    std::fs::metadata(path).ok().as_ref().and_then(modified_ms)
}

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

/// Detect BOM-less UTF-16 by looking for a strong NUL-byte parity skew. This
/// covers the common ASCII-heavy case (the one the editor's own UTF-16 output
/// used to produce when BOM was unchecked); arbitrary binary data is rejected
/// by the NUL/signature guards instead.
fn looks_like_utf16(raw: &[u8]) -> Option<bool> {
    if raw.len() < 2 || raw.len() % 2 != 0 {
        return None;
    }
    let sample = &raw[..raw.len().min(4096)];
    let pairs = sample.len() / 2;
    let mut even_nul = 0usize;
    let mut odd_nul = 0usize;
    for chunk in sample.chunks_exact(2) {
        if chunk[0] == 0 {
            even_nul += 1;
        }
        if chunk[1] == 0 {
            odd_nul += 1;
        }
    }
    let even_ratio = even_nul as f64 / pairs as f64;
    let odd_ratio = odd_nul as f64 / pairs as f64;
    if odd_ratio >= 0.60 && even_ratio <= 0.05 {
        Some(true)
    } else if even_ratio >= 0.60 && odd_ratio <= 0.05 {
        Some(false)
    } else {
        None
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
    } else if let Some(little_endian) = looks_like_utf16(raw) {
        let encoding = if little_endian {
            encoding_rs::UTF_16LE
        } else {
            encoding_rs::UTF_16BE
        };
        let (text, _, _) = encoding.decode(raw);
        let label = if little_endian {
            "UTF-16 LE"
        } else {
            "UTF-16 BE"
        };
        (text.into_owned(), label.to_string(), false)
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
    if is_binary_path(path) {
        return json!({ "error": "Binary file cannot be opened" });
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
    let utf16_bom = raw.starts_with(&[0xFF, 0xFE]) || raw.starts_with(&[0xFE, 0xFF]);
    let utf16_guess = looks_like_utf16(&raw).is_some();
    if is_binary_path(path)
        || has_binary_signature(&raw)
        || (!utf16_bom && !utf16_guess && raw[..head_len].contains(&0))
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
        "modified_ms": modified_ms(&metadata),
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
    let (bytes, mut canonical) = match label.as_str() {
        "utf-8" => (with_eol.into_bytes(), "UTF-8".to_string()),
        "utf-8 bom" | "utf-8 with bom" | "utf-8-sig" => {
            (with_eol.into_bytes(), "UTF-8 BOM".to_string())
        }
        "utf-16 le" | "utf-16" => (utf16_bytes(&with_eol, true), "UTF-16 LE".to_string()),
        "utf-16 be" => (utf16_bytes(&with_eol, false), "UTF-16 BE".to_string()),
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
                (bytes.into_owned(), canonical_label(encoder.name()))
            }
            None => {
                return Err(json!({
                    "error": "encoding",
                    "message": format!("Unknown encoding: {encoding:?}")
                }))
            }
        },
    };

    // UTF-16 without a BOM cannot be detected reliably by other editors (and
    // used to be rejected by our own NUL-byte guard). Always write the BOM.
    let want_bom = match canonical.as_str() {
        "UTF-16 LE" | "UTF-16 BE" => true,
        "UTF-8 BOM" => bom.unwrap_or(true),
        "UTF-8" => bom.unwrap_or(false),
        _ => false,
    };
    if want_bom && canonical == "UTF-8" {
        canonical = "UTF-8 BOM".to_string();
    } else if !want_bom && canonical == "UTF-8 BOM" {
        canonical = "UTF-8".to_string();
    }

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
    if is_binary_path(path) {
        return json!({
            "error": "Binary files cannot be saved as text. Choose a Markdown or text extension."
        });
    }

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

    let parent = path
        .parent()
        .filter(|value| !value.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let (tmp, mut file) = loop {
        let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(".markview-{}-{seq}.tmp", std::process::id()));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => break (candidate, file),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => {
                let message = if e.kind() == std::io::ErrorKind::PermissionDenied {
                    "Permission denied. Try Save As to a different location.".to_string()
                } else {
                    format!("Save failed: {e}")
                };
                return json!({ "error": message });
            }
        }
    };
    if let Err(e) = file.write_all(&bytes) {
        drop(file);
        let _ = std::fs::remove_file(&tmp);
        return json!({ "error": format!("Save failed: {e}") });
    }
    drop(file);
    if let Err(e) = std::fs::rename(&tmp, path) {
        let _ = std::fs::remove_file(&tmp);
        return json!({ "error": format!("Save failed: {e}") });
    }

    json!({
        "success": true,
        "path": display_path(path),
        "encoding": encoding,
        "bom": bom,
        "modified_ms": modified_ms_for_path(path),
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

    #[test]
    fn rejects_binary_extensions_and_signatures() {
        let pdf = temp_path("pdf").with_extension("pdf");
        let write = write_file_data(&pdf, "not really a pdf", None, None, None);
        assert!(write["error"]
            .as_str()
            .unwrap_or_default()
            .contains("Binary"));
        assert!(!pdf.exists());

        // A binary disguised as Markdown must be rejected by its signature.
        let disguised = temp_path("disguised");
        std::fs::write(&disguised, b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n").expect("write");
        let read = read_file_data(&disguised);
        assert_eq!(read["error"].as_str(), Some("Binary file cannot be opened"));
        let _ = std::fs::remove_file(disguised);
    }

    #[test]
    fn save_does_not_touch_a_predictable_temp_file() {
        let path = temp_path("collision");
        let sentinel = path.with_file_name(format!(
            "{}.tmp",
            path.file_name().unwrap_or_default().to_string_lossy()
        ));
        std::fs::write(&sentinel, "keep me").expect("sentinel");
        let result = write_file_data(&path, "new content", None, None, None);
        assert_eq!(result["success"], true);
        assert_eq!(
            std::fs::read_to_string(&sentinel).expect("sentinel still there"),
            "keep me"
        );
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(sentinel);
    }

    #[test]
    fn reports_disk_mtime_for_conflict_checks() {
        let path = temp_path("mtime");
        let write = write_file_data(&path, "content", None, None, None);
        assert_eq!(write["success"], true);
        assert!(write["modified_ms"].as_u64().is_some());
        let read = read_file_data(&path);
        assert_eq!(read["modified_ms"], write["modified_ms"]);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn decodes_bomless_utf16_and_forces_bom_on_save() {
        let path = temp_path("utf16-no-bom");
        std::fs::write(&path, utf16_bytes("hello\n", true)).expect("write bomless");
        let read = read_file_data(&path);
        assert_eq!(read["encoding"].as_str(), Some("UTF-16 LE"));
        assert_eq!(read["bom"].as_bool(), Some(false));
        assert_eq!(read["content"].as_str(), Some("hello\n"));

        let write = write_file_data(&path, "next\n", Some("UTF-16 LE"), Some(false), Some("lf"));
        assert_eq!(write["success"], true);
        assert_eq!(write["bom"].as_bool(), Some(true));

        let reread = read_file_data(&path);
        assert_eq!(reread["encoding"].as_str(), Some("UTF-16 LE"));
        assert_eq!(reread["bom"].as_bool(), Some(true));
        assert_eq!(reread["content"].as_str(), Some("next\n"));
        let _ = std::fs::remove_file(path);
    }
}
