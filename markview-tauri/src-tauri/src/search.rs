//! Full-text search across the workspace.

use std::path::Path;

use glob::{MatchOptions, Pattern};
use regex::{Regex, RegexBuilder};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::prefs::SettingsStore;
use crate::security::display_path;

pub const MAX_SEARCH_FILE_BYTES: u64 = 5 * 1024 * 1024;
pub const MAX_REGEX_PATTERN_LENGTH: usize = 200;
pub const MAX_RESULTS: usize = 500;

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct SearchOptions {
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub regex: bool,
    pub include: String,
    pub exclude: String,
}

fn split_patterns(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn compile(query: &str, opts: &SearchOptions) -> Option<Regex> {
    if opts.regex {
        if query.len() > MAX_REGEX_PATTERN_LENGTH {
            return None;
        }
        let re = RegexBuilder::new(query)
            .case_insensitive(!opts.case_sensitive)
            .build()
            .ok()?;
        // Reject expressions that can match an empty string.
        for sample in ["", "a", "ab\ncd", "123 abc"] {
            if let Some(m) = re.find(sample) {
                if m.start() == m.end() {
                    return None;
                }
            }
        }
        Some(re)
    } else {
        let mut escaped = regex::escape(query);
        if opts.whole_word {
            escaped = format!(r"\b{escaped}\b");
        }
        RegexBuilder::new(&escaped)
            .case_insensitive(!opts.case_sensitive)
            .build()
            .ok()
    }
}

fn glob_matches(pattern: &Pattern, path_norm: &str, name: &str) -> bool {
    let options = MatchOptions {
        case_sensitive: false,
        require_literal_separator: false,
        require_literal_leading_dot: false,
    };
    pattern.matches_with(path_norm, options) || pattern.matches_with(name, options)
}

fn should_skip_dir(name: &str, exclude: &[Pattern]) -> bool {
    if name.starts_with('.') {
        return true;
    }
    exclude
        .iter()
        .any(|p| p.matches_with(name, MatchOptions::new()))
}

pub fn search_in_files(
    root: &Path,
    query: &str,
    folder: Option<&Path>,
    settings: &SettingsStore,
    opts: &SearchOptions,
) -> Vec<Value> {
    let Some(re) = compile(query, opts) else {
        return Vec::new();
    };
    if query.is_empty() || query.len() > 500 {
        return Vec::new();
    }

    let search_root = folder.unwrap_or(root);

    let include_patterns: Vec<Pattern> = split_patterns(&opts.include)
        .iter()
        .filter_map(|p| Pattern::new(p).ok())
        .collect();
    let mut exclude_raw = split_patterns(&opts.exclude);
    exclude_raw.extend(settings.get_str_list("files.exclude_patterns"));
    let exclude_patterns: Vec<Pattern> = exclude_raw
        .iter()
        .filter_map(|p| Pattern::new(p).ok())
        .collect();

    let extensions = settings.get_string_list_or(
        "files.visible_extensions",
        &[".md", ".markdown", ".mdx", ".txt"],
    );

    let mut results = Vec::new();

    let walker = walkdir::WalkDir::new(search_root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            if !e.file_type().is_dir() {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !should_skip_dir(&name, &exclude_patterns)
        });

    'outer: for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let full = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let path_norm = display_path(full);

        if !include_patterns.is_empty()
            && !include_patterns
                .iter()
                .any(|p| glob_matches(p, &path_norm, &name))
        {
            continue;
        }
        if exclude_patterns
            .iter()
            .any(|p| glob_matches(p, &path_norm, &name))
        {
            continue;
        }

        if include_patterns.is_empty() {
            let ext = format!(
                ".{}",
                full.extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default()
            );
            if !extensions.iter().any(|e| e.eq_ignore_ascii_case(&ext)) {
                continue;
            }
        }

        let Ok(meta) = std::fs::metadata(full) else {
            continue;
        };
        if meta.len() > MAX_SEARCH_FILE_BYTES {
            continue;
        }
        let Ok(raw) = std::fs::read(full) else {
            continue;
        };
        let head = &raw[..raw.len().min(1024)];
        if head.contains(&0) {
            continue;
        }
        let text = String::from_utf8_lossy(&raw);

        for (idx, line) in text.lines().enumerate() {
            if let Some(m) = re.find(line) {
                if m.start() != m.end() {
                    let snippet: String = line.trim().chars().take(200).collect();
                    results.push(json!({
                        "file": path_norm,
                        "filename": name,
                        "line": idx + 1,
                        "text": snippet,
                    }));
                    if results.len() >= MAX_RESULTS {
                        break 'outer;
                    }
                }
            }
        }
    }

    results
}
