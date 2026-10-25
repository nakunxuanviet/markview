import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import hljs from "../highlight";
import katex from "katex";

import { api } from "../api";
import { editorBus } from "../editorBus";
import { editorRef } from "../editorRef";
import { registerPreviewScroller } from "../scrollSync";
import { useStore } from "../store";
import { resolveRelative } from "../utils";

interface InlineEdit {
  top: number;
  left: number;
  width: number;
  height: number;
  value: string;
  startLine: number;
  endLine: number;
}

export function PreviewPane({ hidden = false }: { hidden?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef("");
  const sourceRef = useRef("");
  const renderSeq = useRef(0);
  const [html, setHtml] = useState("");
  const [inline, setInline] = useState<InlineEdit | null>(null);

  const activeId = useStore((state) => state.activeId);
  const tabPath = useStore((state) =>
    state.activeId ? (state.tabs[state.activeId]?.path ?? null) : null,
  );
  const theme = useStore((state) => state.theme);
  const doubleClickEnabled = useStore(
    (state) => state.settings.preview.double_click_preview,
  );
  const renderMathOn = useStore((state) => state.settings.preview.render_math);
  const renderMermaidOn = useStore(
    (state) => state.settings.preview.render_mermaid,
  );
  const previewFont = useStore(
    (state) => state.settings.appearance.font_family_preview,
  );
  const previewFontSize = useStore(
    (state) => state.settings.appearance.font_size_preview,
  );

  const renderMarkdown = useCallback(async (content: string) => {
    sourceRef.current = content;
    const seq = ++renderSeq.current;
    if (!content.trim()) {
      htmlRef.current = "";
      setHtml("");
      return;
    }
    try {
      const result = await api.renderMarkdown(content);
      if (seq !== renderSeq.current) return;
      htmlRef.current = result?.html ?? "";
      setHtml(htmlRef.current);
    } catch (error) {
      console.error("render failed", error);
    }
  }, []);

  // Initial render + active tab changes.
  useEffect(() => {
    const state = useStore.getState();
    const tab = state.activeId ? state.tabs[state.activeId] : null;
    void renderMarkdown(tab?.content ?? "");
  }, [activeId, renderMarkdown]);

  // Debounced re-render while typing.
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = editorBus.on((tabId, content) => {
      if (tabId !== useStore.getState().activeId) return;
      sourceRef.current = content;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void renderMarkdown(content), 160);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      unsubscribe();
    };
  }, [renderMarkdown]);

  // Mermaid bakes theme colors into its SVG, so the content node is keyed by
  // theme: a switch remounts the markup and the post-processing effect below
  // renders the diagrams again with the new palette.

  // Register the scroll pane for two-way scroll sync.
  useEffect(() => {
    registerPreviewScroller(panelRef.current);
    return () => registerPreviewScroller(null);
  }, []);

  // Post-process the injected HTML.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    root.querySelectorAll<HTMLElement>("pre code").forEach((block) => {
      if (block.classList.contains("language-mermaid")) return;
      try {
        hljs.highlightElement(block);
      } catch {
        /* ignore unknown languages */
      }
    });
    addCopyButtons(root);

    if (renderMathOn) {
      renderBlockMath(root);
      renderMath(root);
    }
    processCheckboxes(root);
    processLinks(root);
    if (tabPath) processImages(root, tabPath);

    let cancelled = false;
    if (renderMermaidOn) {
      void renderMermaid(root, theme, () => cancelled);
    }
    return () => {
      cancelled = true;
    };
  }, [
    html,
    theme,
    tabPath,
    renderMathOn,
    renderMermaidOn,
    previewFont,
    previewFontSize,
  ]);

  const onDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!doubleClickEnabled) return;
      const target = event.target as HTMLElement;
      const block = target.closest<HTMLElement>(
        "#preview-content p, #preview-content h1, #preview-content h2, #preview-content h3, #preview-content h4, #preview-content h5, #preview-content h6, #preview-content li, #preview-content blockquote, #preview-content pre, #preview-content td",
      );
      if (!block || !editorRef.view) return;
      const range = findSourceRange(sourceRef.current, block);
      if (!range) return;

      const rect = block.getBoundingClientRect();
      setInline({
        top: rect.top,
        left: rect.left,
        width: Math.max(rect.width, 220),
        height: Math.max(rect.height, 60),
        value: sourceRef.current
          .split("\n")
          .slice(range.start, range.end + 1)
          .join("\n"),
        startLine: range.start,
        endLine: range.end,
      });
    },
    [doubleClickEnabled],
  );

  const commitInline = useCallback(
    (value: string) => {
      if (!inline || !editorRef.view) {
        setInline(null);
        return;
      }
      const view = editorRef.view;
      try {
        const from = view.state.doc.line(inline.startLine + 1).from;
        const to = view.state.doc.line(inline.endLine + 1).to;
        view.dispatch({ changes: { from, to, insert: value } });
      } catch {
        /* line range changed underneath us */
      }
      setInline(null);
      void renderMarkdown(editorRef.view.state.doc.toString());
    },
    [inline, renderMarkdown],
  );

  return (
    <div id="preview-panel" className={hidden ? "hidden" : ""} ref={panelRef}>
      <div className="pane-bar preview-bar">
        <span className="pane-title">Preview</span>
        <span className="live-badge">
          <i />
          Live
        </span>
        <div className="bar-spacer" />
        <span className="bar-label">Markdown</span>
      </div>
      <div
        id="preview-content"
        key={`${theme}:${previewFont}:${previewFontSize}`}
        ref={contentRef}
        onDoubleClick={onDoubleClick}
        onClick={(event) => {
          if (handleCopyClick(event)) return;
          handleLinkClick(event, tabPath);
        }}
        dangerouslySetInnerHTML={{
          __html:
            html ||
            '<p style="color:var(--text-muted)">Preview will appear here...</p>',
        }}
      />
      {inline && (
        <div
          className="inline-edit-overlay"
          style={{
            position: "fixed",
            top: inline.top,
            left: inline.left,
            width: inline.width,
            minHeight: inline.height,
          }}
        >
          <textarea
            autoFocus
            value={inline.value}
            onChange={(event) =>
              setInline({ ...inline, value: event.target.value })
            }
            onBlur={() => commitInline(inline.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setInline(null);
              } else if (
                event.key === "Enter" &&
                (event.ctrlKey || event.metaKey)
              ) {
                event.preventDefault();
                commitInline(inline.value);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

function processCheckboxes(root: HTMLElement) {
  root.querySelectorAll<HTMLLIElement>("li").forEach((li) => {
    if (li.querySelector('input[type="checkbox"]')) {
      li.classList.add("task-list-item");
      return;
    }
    const text = li.innerHTML;
    if (text.startsWith("[ ] ")) {
      li.innerHTML = '<input type="checkbox" disabled> ' + text.slice(4);
      li.classList.add("task-list-item");
    } else if (text.startsWith("[x] ") || text.startsWith("[X] ")) {
      li.innerHTML =
        '<input type="checkbox" checked disabled> ' + text.slice(4);
      li.classList.add("task-list-item");
    }
  });
}

function processLinks(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    anchor.setAttribute("rel", "noopener noreferrer");
    anchor.removeAttribute("target");
  });
}

function processImages(root: HTMLElement, tabPath: string) {
  root.querySelectorAll<HTMLImageElement>("img[src]").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!src || /^(https?:|data:|blob:|markview:|asset:)/i.test(src)) return;
    const absolute = resolveRelative(tabPath, src);
    try {
      img.src = convertFileSrc(absolute, "markview");
    } catch {
      /* keep the raw src */
    }
  });
}

/** Wrap fenced code in a small frame with a language label and copy button. */
function addCopyButtons(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("pre").forEach((pre) => {
    if (pre.closest(".code-block")) return;
    const code = pre.querySelector("code");
    if (!code || code.classList.contains("language-mermaid")) return;

    const language =
      Array.from(code.classList)
        .find((name) => name.startsWith("language-"))
        ?.slice("language-".length) ?? "text";

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.replaceWith(wrapper);
    wrapper.appendChild(pre);

    const bar = document.createElement("div");
    bar.className = "code-block-bar";

    const label = document.createElement("span");
    label.className = "code-block-lang";
    label.textContent = language;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy";
    button.textContent = "Copy";
    button.title = "Copy code";

    bar.append(label, button);
    wrapper.insertBefore(bar, pre);
  });
}

/** Returns true when the click targeted a copy button. */
function handleCopyClick(event: ReactMouseEvent<HTMLDivElement>): boolean {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>(".code-copy");
  if (!button) return false;
  event.preventDefault();
  event.stopPropagation();

  const code = button.closest(".code-block")?.querySelector("code");
  if (!code) return true;
  const text = code.textContent ?? "";

  const finish = () => {
    button.textContent = "Copied";
    button.classList.add("copied");
    window.setTimeout(() => {
      button.textContent = "Copy";
      button.classList.remove("copied");
    }, 1400);
  };
  const fallback = () => {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      finish();
    } finally {
      area.remove();
    }
  };

  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).then(finish).catch(fallback);
  } else {
    fallback();
  }
  return true;
}

/**
 * Display math written across several lines (`$$\n…\n$$`) is split into
 * separate text nodes by the hard-break renderer, so handle whole paragraphs
 * that consist of nothing but a `$$…$$` block first.
 */
function renderBlockMath(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("p").forEach((paragraph) => {
    const text = paragraph.textContent ?? "";
    const match = text.match(/^\s*\$\$([\s\S]+?)\$\$\s*$/);
    if (!match) return;
    const span = document.createElement("span");
    try {
      katex.render(match[1].trim(), span, {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return;
    }
    paragraph.replaceWith(span);
  });
}

function renderMath(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent && parent !== root) {
        const tag = parent.tagName.toLowerCase();
        if (
          tag === "pre" ||
          tag === "code" ||
          parent.classList.contains("katex")
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  const pattern = /\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;

  for (const node of nodes) {
    const text = node.textContent ?? "";
    if (!text.includes("$")) continue;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let found = false;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      found = true;
      if (match.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex, match.index)),
        );
      }
      const display = match[1] !== undefined;
      const tex = (display ? match[1] : match[2]).trim();
      const span = document.createElement("span");
      try {
        katex.render(tex, span, { displayMode: display, throwOnError: false });
      } catch {
        span.className = "katex-error";
        span.textContent = tex;
      }
      fragment.appendChild(span);
      lastIndex = match.index + match[0].length;
    }

    if (found) {
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      node.parentNode?.replaceChild(fragment, node);
    }
  }
}

/**
 * Mermaid's built-in themes do not match either app palette, so use `base`
 * with explicit tokens. Edge lines and labels are the parts that disappear
 * against a dark background when only the `dark` theme is selected.
 */
function mermaidTheme(theme: string, root: HTMLElement) {
  const styles = getComputedStyle(document.documentElement);
  const rootStyle = getComputedStyle(root);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  const dark = theme === "dark";

  const background = token("--mermaid-bg", dark ? "#0b101c" : "#fbf8f1");
  const surface = token("--mermaid-surface", dark ? "#131a2b" : "#f3eee2");
  const nodeBg = token("--mermaid-node-bg", dark ? "#151d30" : "#ffffff");
  const nodeBorder = token(
    "--mermaid-node-border",
    dark ? "#455171" : "#b9b0a0",
  );
  const nodeText = token("--mermaid-node-text", dark ? "#eef2fb" : "#26231d");
  const line = token("--mermaid-line", dark ? "#a8b6da" : "#6b6357");
  const labelBg = token("--mermaid-label-bg", background);
  const labelText = token("--mermaid-label-text", nodeText);
  const clusterBg = token("--mermaid-cluster-bg", dark ? "#101728" : "#f7f3e9");

  return {
    theme: "base" as const,
    themeVariables: {
      darkMode: dark,
      background,
      // Base theme ships an SVG drop shadow with a white flood colour, which
      // reads as a glow around every node on dark backgrounds. A crisp border
      // is enough.
      dropShadow: "none",
      nodeShadow: false,
      fontFamily: rootStyle.fontFamily || '"Segoe UI", system-ui, sans-serif',
      fontSize: rootStyle.fontSize || "15px",
      primaryColor: nodeBg,
      primaryBorderColor: nodeBorder,
      primaryTextColor: nodeText,
      secondaryColor: surface,
      tertiaryColor: clusterBg,
      lineColor: line,
      textColor: nodeText,
      mainBkg: nodeBg,
      nodeBorder,
      nodeTextColor: nodeText,
      clusterBkg: clusterBg,
      clusterBorder: token(
        "--mermaid-cluster-border",
        dark ? "#35415f" : "#c9c1b2",
      ),
      edgeLabelBackground: labelBg,
      labelBackground: labelBg,
      labelTextColor: labelText,
      titleColor: nodeText,
      actorBkg: nodeBg,
      actorBorder: nodeBorder,
      actorTextColor: nodeText,
      actorLineColor: line,
      signalColor: line,
      signalTextColor: labelText,
      noteBkgColor: token("--mermaid-note-bg", dark ? "#1b2440" : "#fff8e6"),
      noteTextColor: token("--mermaid-note-text", dark ? "#eef2fb" : "#26231d"),
      noteBorderColor: token(
        "--mermaid-note-border",
        dark ? "#4d5b7d" : "#d7c9a6",
      ),
      activationBkgColor: token(
        "--mermaid-activation-bg",
        dark ? "#22304f" : "#efe7d7",
      ),
      activationBorderColor: token(
        "--mermaid-activation-border",
        dark ? "#5d6d95" : "#b9b0a0",
      ),
      sequenceNumberColor: labelText,
      attributeBackgroundColorOdd: nodeBg,
      attributeBackgroundColorEven: surface,
    },
  };
}

async function renderMermaid(
  root: HTMLElement,
  theme: string,
  isCancelled: () => boolean,
) {
  const blocks = root.querySelectorAll<HTMLElement>(
    "pre code.language-mermaid",
  );
  if (blocks.length === 0) return;

  const targets: { container: HTMLElement; code: string }[] = [];
  blocks.forEach((block, index) => {
    const pre = block.parentElement;
    if (!pre) return;
    const container = document.createElement("div");
    container.className = "mermaid-diagram";
    container.id = `mermaid-${Date.now()}-${index}`;
    pre.replaceWith(container);
    targets.push({ container, code: block.textContent ?? "" });
  });

  try {
    const mermaid = (await import("mermaid")).default;
    if (isCancelled()) return;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      ...mermaidTheme(theme, root),
    });
    // `render` hands back the SVG string, which avoids the silent layout
    // failures that `run` can hit when the container has just been swapped in.
    for (const [index, target] of targets.entries()) {
      const { svg } = await mermaid.render(
        `markview-mermaid-${Date.now()}-${index}`,
        target.code,
      );
      if (isCancelled()) return;
      target.container.innerHTML = svg;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    console.warn("mermaid render failed", error);
    targets.forEach(({ container }) => {
      container.textContent = `mermaid error: ${message}`;
    });
  }
}

function handleLinkClick(
  event: ReactMouseEvent<HTMLDivElement>,
  tabPath: string | null,
) {
  const target = event.target as HTMLElement;
  const anchor = target.closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href) return;

  if (href.startsWith("#")) {
    event.preventDefault();
    const id = decodeURIComponent(href.slice(1));
    const heading = document.getElementById(id);
    heading?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (/^(https?:|mailto:)/i.test(href)) {
    event.preventDefault();
    void openUrl(href);
    return;
  }

  event.preventDefault();
  if (!tabPath) return;
  const path = resolveRelative(tabPath, href.split("#")[0]);
  void useStore.getState().openPath(path, false);
}

/** Best-effort mapping from a rendered block back to source lines. */
function findSourceRange(
  content: string,
  block: HTMLElement,
): { start: number; end: number } | null {
  const lines = content.split("\n");
  const plain = (block.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!plain) return null;
  const needle = plain.slice(0, 24);

  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const stripped = lines[i]
      .replace(/^[\s#>*+\-]+/, "")
      .replace(/^\d+\.\s*/, "")
      .replace(/[*_`~[\]()!]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!stripped) continue;
    if (stripped.startsWith(needle) || stripped.includes(needle.slice(0, 12))) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  const tag = block.tagName.toLowerCase();

  if (tag === "pre") {
    let fenceStart = start;
    for (let i = start; i >= 0; i -= 1) {
      if (/^\s*(```|~~~)/.test(lines[i])) {
        fenceStart = i;
        break;
      }
    }
    let fenceEnd = fenceStart;
    for (let i = fenceStart + 1; i < lines.length; i += 1) {
      if (/^\s*(```|~~~)/.test(lines[i])) {
        fenceEnd = i;
        break;
      }
    }
    return { start: fenceStart, end: fenceEnd };
  }

  if (/^h[1-6]$/.test(tag) || tag === "li") {
    return { start, end: start };
  }

  if (tag === "blockquote") {
    let end = start;
    while (end + 1 < lines.length && /^\s*>/.test(lines[end + 1])) end += 1;
    return { start, end };
  }

  // Paragraph / table cell: consume until a blank line.
  let end = start;
  while (end + 1 < lines.length && lines[end + 1].trim() !== "") end += 1;
  return { start, end };
}
