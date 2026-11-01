//! Markdown → sanitized HTML (comrak + ammonia).

use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use serde_json::{json, Value};

const ALLOWED_TAGS: &[&str] = &[
    "a",
    "abbr",
    "acronym",
    "blockquote",
    "br",
    "code",
    "dd",
    "del",
    "details",
    "div",
    "dl",
    "dt",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "input",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
];

const GLOBAL_ATTRS: &[&str] = &["class", "title", "id", "data-sourcepos"];

static BUILDER: OnceLock<ammonia::Builder<'static>> = OnceLock::new();

fn builder() -> &'static ammonia::Builder<'static> {
    BUILDER.get_or_init(build_builder)
}

fn build_builder() -> ammonia::Builder<'static> {
    let tags: HashSet<&str> = ALLOWED_TAGS.iter().copied().collect();

    let mut tag_attributes: HashMap<&str, HashSet<&str>> = HashMap::new();
    tag_attributes.insert("a", ["href", "title"].into_iter().collect());
    tag_attributes.insert("code", ["class"].into_iter().collect());
    tag_attributes.insert("div", ["class"].into_iter().collect());
    for level in ["h1", "h2", "h3", "h4", "h5", "h6"] {
        tag_attributes.insert(level, ["id", "class"].into_iter().collect());
    }
    tag_attributes.insert(
        "img",
        ["src", "alt", "title", "width", "height"]
            .into_iter()
            .collect(),
    );
    tag_attributes.insert("ol", ["start"].into_iter().collect());
    tag_attributes.insert("pre", ["class"].into_iter().collect());
    tag_attributes.insert("span", ["class"].into_iter().collect());
    tag_attributes.insert("table", ["class"].into_iter().collect());
    tag_attributes.insert("td", ["align", "colspan", "rowspan"].into_iter().collect());
    tag_attributes.insert("th", ["align", "colspan", "rowspan"].into_iter().collect());
    tag_attributes.insert(
        "input",
        ["type", "checked", "disabled"].into_iter().collect(),
    );
    tag_attributes.insert("details", ["open"].into_iter().collect());

    let generic: HashSet<&str> = GLOBAL_ATTRS.iter().copied().collect();
    let schemes: HashSet<&str> = ["http", "https", "mailto"].into_iter().collect();

    let mut builder = ammonia::Builder::default();
    builder
        .tags(tags)
        .generic_attributes(generic)
        .tag_attributes(tag_attributes)
        .url_schemes(schemes)
        .strip_comments(true)
        .link_rel(Some("noopener noreferrer"))
        // Prefix every id so a document cannot reuse app ids such as
        // `settings-panel` or `preview-content` to trigger global app CSS.
        .id_prefix(Some("user-content-"))
        .attribute_filter(|_element, attribute, value| {
            if matches!(attribute, "href" | "src" | "poster" | "action") {
                let value_trimmed = value.trim_start();
                let bytes = value_trimmed.as_bytes();
                let network_path = bytes.len() >= 2
                    && matches!(bytes[0], b'/' | b'\\')
                    && matches!(bytes[1], b'/' | b'\\');
                if network_path {
                    return None;
                }
            }
            if attribute == "href" && value.starts_with('#') {
                if value.starts_with("#user-content-") {
                    return Some(Cow::Borrowed(value));
                }
                return Some(Cow::Owned(format!("#user-content-{}", &value[1..])));
            }
            if attribute == "class" {
                // Only keep semantic highlight/footnote/task classes. Raw app
                // classes (`mv-modal`, `settings-overlay`, `toast-container`…)
                // must not reach the global stylesheet.
                let kept: Vec<&str> = value
                    .split_whitespace()
                    .filter(|token| {
                        token.starts_with("language-")
                            || *token == "hljs"
                            || token.starts_with("footnote")
                            || token.starts_with("task-list")
                            || *token == "contains-task-list"
                    })
                    .collect();
                if kept.is_empty() {
                    return None;
                }
                return Some(Cow::Owned(kept.join(" ")));
            }
            Some(Cow::Borrowed(value))
        });
    builder
}

pub fn sanitize(html: &str) -> String {
    builder().clean(html).to_string()
}

pub fn render(text: &str) -> Value {
    let mut options = comrak::Options::default();
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.autolink = true;
    options.extension.tasklist = true;
    options.extension.description_lists = true;
    options.extension.footnotes = true;
    options.extension.header_ids = Some(String::new());
    options.extension.front_matter_delimiter = Some("---".to_string());
    options.render.r#unsafe = true;
    // Parity with the Python app (nl2br): a single newline is a hard break.
    options.render.hardbreaks = true;
    // `data-sourcepos` lets the preview map a task checkbox back to its line.
    options.render.sourcepos = true;

    let html = comrak::markdown_to_html(text, &options);
    json!({ "html": sanitize(&html), "toc": "" })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_scripts() {
        let out = sanitize("<p>hi</p><script>alert(1)</script>");
        assert!(!out.contains("<script"));
        assert!(out.contains("hi"));
    }

    #[test]
    fn strips_javascript_urls() {
        let out = sanitize("<a href=\"javascript:alert(1)\">x</a>");
        assert!(!out.contains("javascript:"));
    }

    #[test]
    fn strips_protocol_relative_and_unc_urls() {
        let out = sanitize(
            "<a href=\"//evil.example/x\">x</a><img src=\"//evil.example/x.png\"><a href=\"\\\\evil\\share\\x\">y</a>",
        );
        assert!(!out.contains("//evil.example"));
        assert!(!out.contains(r"\\evil"));
        assert!(out.contains("x"));
    }

    #[test]
    fn strips_app_classes_and_prefixes_ids() {
        let out = sanitize(
            "<div class=\"mv-modal\" id=\"settings-panel\">fake</div><a href=\"#fn1\">x</a><h2 id=\"fn1\">H</h2><pre class=\"mv-modal language-js\"><code class=\"language-js\">x</code></pre>",
        );
        assert!(!out.contains("mv-modal"));
        assert!(!out.contains("id=\"settings-panel\""));
        assert!(out.contains("id=\"user-content-settings-panel\""));
        assert!(out.contains("href=\"#user-content-fn1\""), "{out}");
        assert!(out.contains("id=\"user-content-fn1\""));
        assert!(out.contains("class=\"language-js\""));
    }

    #[test]
    fn renders_tables() {
        let out = render("| a | b |\n|---|---|\n| 1 | 2 |");
        let html = out["html"].as_str().unwrap();
        assert!(html.contains("<table"));
    }

    #[test]
    fn keeps_language_class_on_fenced_code() {
        let out = render("```mermaid\ngraph LR\nA-->B\n```");
        let html = out["html"].as_str().unwrap();
        assert!(
            html.contains(r#"<code class="language-mermaid">"#),
            "unexpected html: {html}"
        );
    }

    #[test]
    fn leaves_math_untouched() {
        let out = render("$$\n\\int_0^\\infty e^{-x^2} dx\n$$");
        let html = out["html"].as_str().unwrap();
        assert!(html.contains(r"\int_0^\infty"), "unexpected html: {html}");
        assert!(!html.contains("<sup>"), "unexpected html: {html}");
    }
}
