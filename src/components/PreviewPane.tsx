import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Text as CodeMirrorText } from "@codemirror/state";
import hljs from "../highlight";
import katex from "katex";

import { api } from "../api";
import { editorBus } from "../editorBus";
import { editorRef } from "../editorRef";
import {
  cacheBytes,
  highlightCache,
  mathCache,
  mermaidCache,
  previewCacheKey,
} from "../previewCache";
import {
  PREVIEW_DEBOUNCE,
  PREVIEW_MERMAID_DELAY,
  PREVIEW_MAX_WAIT,
  previewTier,
  type PreviewTier,
} from "../previewConfig";
import { registerPreviewScroller } from "../scrollSync";
import { useStore } from "../store";
import { formatSize, resolveRelative } from "../utils";

interface InlineEdit {
  top: number;
  left: number;
  width: number;
  height: number;
  value: string;
  startLine: number;
  endLine: number;
}

type RenderStatus = "live" | "updating" | "paused";

let mermaidLoader: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid(): Promise<typeof import("mermaid").default> {
  mermaidLoader ??= import("mermaid").then((module) => module.default);
  return mermaidLoader;
}

export function PreviewPane({
  hidden = false,
  active = false,
}: {
  hidden?: boolean;
  active?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef("");
  const sourceRef = useRef("");
  const renderedTextRef = useRef("");
  const latestDocRef = useRef<CodeMirrorText | null>(null);
  const renderSeq = useRef(0);
  const renderingRef = useRef(false);
  const pendingRef = useRef(false);
  const activeRef = useRef(active);
  const timerRef = useRef<number | undefined>(undefined);
  const maxTimerRef = useRef<number | undefined>(undefined);
  const tierRef = useRef<PreviewTier | null>(null);
  const lastActiveIdRef = useRef<string | null>(null);
  const scheduleRef = useRef<(doc: CodeMirrorText) => void>(() => undefined);

  const [html, setHtml] = useState("");
  const [inline, setInline] = useState<InlineEdit | null>(null);
  const [renderStatus, setRenderStatus] = useState<RenderStatus>("live");
  const [largeTier, setLargeTier] = useState<PreviewTier | null>(null);
  const [largeBytes, setLargeBytes] = useState(0);
  const largeBytesRef = useRef(0);

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

  const clearTimers = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (maxTimerRef.current !== undefined) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = undefined;
    }
  }, []);

  const runRender = useCallback(async () => {
    if (!activeRef.current) return;
    clearTimers();
    tierRef.current = null;
    if (renderingRef.current) {
      pendingRef.current = true;
      return;
    }
    const doc = latestDocRef.current;
    if (!doc) return;

    const text = doc.toString();
    if (text === renderedTextRef.current) {
      pendingRef.current = false;
      setRenderStatus(previewTier(text.length) === "huge" ? "paused" : "live");
      return;
    }

    renderingRef.current = true;
    const seq = ++renderSeq.current;
    setRenderStatus("updating");
    try {
      const result = await api.renderMarkdown(text);
      if (seq !== renderSeq.current || !activeRef.current) return;
      renderedTextRef.current = text;
      sourceRef.current = text;
      htmlRef.current = result?.html ?? "";
      setHtml(htmlRef.current);
      setRenderStatus(previewTier(text.length) === "huge" ? "paused" : "live");
    } catch (error) {
      console.error("render failed", error);
      setRenderStatus("paused");
    } finally {
      renderingRef.current = false;
      const changed = latestDocRef.current !== doc;
      pendingRef.current = changed;
      if (changed && activeRef.current && latestDocRef.current) {
        scheduleRef.current(latestDocRef.current);
      }
    }
  }, [clearTimers]);

  const schedule = useCallback(
    (doc: CodeMirrorText) => {
      const tier = previewTier(doc.length);
      setLargeTier(tier === "idle" || tier === "huge" ? tier : null);
      if (
        (tier === "idle" || tier === "huge") &&
        Math.abs(doc.length - largeBytesRef.current) >= 2048
      ) {
        largeBytesRef.current = doc.length;
        setLargeBytes(doc.length);
      }

      if (!activeRef.current) {
        pendingRef.current = true;
        return;
      }

      if (tier === "huge") {
        // Manual only. Entering this tier drops any previous preview DOM so a
        // 16 MB document does not keep making every keystroke expensive.
        clearTimers();
        if (tierRef.current !== "huge" && htmlRef.current) {
          htmlRef.current = "";
          renderedTextRef.current = "";
          sourceRef.current = "";
          setHtml("");
        }
        tierRef.current = tier;
        pendingRef.current = true;
        setRenderStatus("paused");
        return;
      }

      if (tierRef.current !== tier) {
        clearTimers();
        tierRef.current = tier;
      } else if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }

      const delay =
        tier === "normal"
          ? PREVIEW_DEBOUNCE.normal
          : tier === "large"
            ? PREVIEW_DEBOUNCE.large
            : PREVIEW_DEBOUNCE.idle;
      const maxWait =
        tier === "normal"
          ? PREVIEW_MAX_WAIT.normal
          : tier === "large"
            ? PREVIEW_MAX_WAIT.large
            : PREVIEW_MAX_WAIT.idle;

      setRenderStatus("updating");
      timerRef.current = window.setTimeout(() => void runRender(), delay);
      // maxWait is measured from the first pending keystroke, not reset on
      // every key. Without this the preview only updates when typing stops.
      if (maxWait > 0 && maxTimerRef.current === undefined) {
        maxTimerRef.current = window.setTimeout(
          () => void runRender(),
          maxWait,
        );
      }
    },
    [clearTimers, runRender],
  );

  scheduleRef.current = schedule;

  const forceRender = useCallback(() => {
    if (!activeRef.current) return;
    clearTimers();
    void runRender();
  }, [clearTimers, runRender]);

  const docForActiveTab = useCallback((): CodeMirrorText | null => {
    const state = useStore.getState();
    const id = state.activeId;
    if (!id) return null;
    if (state.editorTabId === id && editorRef.view) {
      return editorRef.view.state.doc;
    }
    const tab = state.tabs[id];
    if (!tab) return null;
    return CodeMirrorText.of(tab.content.split(/\r\n?|\n/));
  }, []);

  // Active tab changes: render the tab that is actually visible.
  useEffect(() => {
    renderSeq.current += 1;
    const doc = docForActiveTab();
    latestDocRef.current = doc;
    pendingRef.current = true;
    setInline(null);
    if (!active || !doc) return;

    const tabChanged = lastActiveIdRef.current !== activeId;
    lastActiveIdRef.current = activeId;
    const tier = previewTier(doc.length);
    setLargeTier(tier === "idle" || tier === "huge" ? tier : null);
    if (tier === "idle" || tier === "huge") {
      largeBytesRef.current = doc.length;
      setLargeBytes(doc.length);
    }
    // Huge documents are not rendered automatically: a 16 MB preview DOM
    // makes typing in the editor unusable. The notice offers a manual render.
    if (tier === "huge") {
      if (tabChanged) {
        htmlRef.current = "";
        renderedTextRef.current = "";
        sourceRef.current = "";
        setHtml("");
      }
      setRenderStatus("paused");
      return;
    }
    // Tab switches should feel immediate, not wait for the typing debounce.
    forceRender();
  }, [activeId, active, docForActiveTab, forceRender]);

  // Preview showed/hidden (WRITE/READ/SPLIT).
  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      clearTimers();
      renderSeq.current += 1;
      if (latestDocRef.current) pendingRef.current = true;
      // A rendered 5 MB document is a ~16 MB DOM; release it when the pane
      // is hidden instead of keeping it alive for the whole session.
      if (
        latestDocRef.current &&
        previewTier(latestDocRef.current.length) === "huge"
      ) {
        htmlRef.current = "";
        renderedTextRef.current = "";
        sourceRef.current = "";
        setHtml("");
      }
      return;
    }
    if (pendingRef.current) {
      const doc = latestDocRef.current;
      if (doc && previewTier(doc.length) === "huge") {
        setRenderStatus("paused");
      } else {
        forceRender();
      }
    }
  }, [active, clearTimers, forceRender]);

  // Typing stream: keep the latest document only; no stringify until render.
  useEffect(() => {
    const unsubscribe = editorBus.on((tabId, doc) => {
      if (tabId !== useStore.getState().activeId) return;
      latestDocRef.current = doc;
      pendingRef.current = true;
      if (!activeRef.current) return;
      schedule(doc);
    });
    return () => {
      unsubscribe();
      clearTimers();
    };
  }, [clearTimers, schedule]);

  // The preview pane is hidden and the window is minimized: stop work.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearTimers();
        if (latestDocRef.current) pendingRef.current = true;
        return;
      }
      if (!activeRef.current || !pendingRef.current) return;
      const doc = latestDocRef.current;
      if (doc && previewTier(doc.length) === "huge") {
        setRenderStatus("paused");
      } else {
        forceRender();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [clearTimers, forceRender]);

  // Manual refresh (Ctrl+Enter, palette, button).
  useEffect(() => {
    const onRequest = () => forceRender();
    window.addEventListener("markview:preview-update", onRequest);
    return () =>
      window.removeEventListener("markview:preview-update", onRequest);
  }, [forceRender]);

  // Register the scroll pane for two-way scroll sync.
  useEffect(() => {
    registerPreviewScroller(panelRef.current);
    return () => registerPreviewScroller(null);
  }, []);

  // Post-process the injected HTML. Skipped entirely while the pane is hidden.
  useEffect(() => {
    if (!active) return;
    const root = contentRef.current;
    if (!root) return;
    if (!html) return;

    highlightCode(root);
    addCopyButtons(root);

    if (renderMathOn) {
      renderBlockMath(root);
      renderMath(root);
    }
    processCheckboxes(root);
    processLinks(root);
    if (tabPath) processImages(root, tabPath);
  }, [
    html,
    active,
    theme,
    tabPath,
    renderMathOn,
    previewFont,
    previewFontSize,
  ]);

  // Mermaid is deferred and cached; it is the most expensive post-process.
  useEffect(() => {
    if (!active || !renderMermaidOn) return;
    const root = contentRef.current;
    if (!root) return;

    const blocks = root.querySelectorAll<HTMLElement>(
      "pre code.language-mermaid",
    );
    if (blocks.length === 0) return;

    const rootStyle = getComputedStyle(root);
    const font = rootStyle.fontFamily || "";
    const fontSize = rootStyle.fontSize || "";
    const targets: { container: HTMLElement; code: string; key: string }[] = [];
    blocks.forEach((block, index) => {
      const pre = block.parentElement;
      if (!pre) return;
      const container = document.createElement("div");
      container.className = "mermaid-diagram mermaid-pending";
      container.id = `mermaid-${Date.now()}-${index}`;
      container.textContent = "Diagram · updating…";
      pre.replaceWith(container);
      const code = block.textContent ?? "";
      const source = `${theme}\u0000${font}\u0000${fontSize}\u0000${code}`;
      targets.push({
        container,
        code,
        key: previewCacheKey("mermaid", source),
      });
    });
    if (targets.length === 0) return;

    let cancelled = false;
    const tier = previewTier(sourceRef.current.length);
    const delay =
      tier === "normal"
        ? PREVIEW_MERMAID_DELAY.normal
        : tier === "large"
          ? PREVIEW_MERMAID_DELAY.large
          : PREVIEW_MERMAID_DELAY.idle;

    const paintCached = () => {
      let missing = false;
      for (const target of targets) {
        const source = `${theme}\u0000${font}\u0000${fontSize}\u0000${target.code}`;
        const cached = mermaidCache.get(target.key, source);
        if (cached === undefined) {
          missing = true;
          continue;
        }
        target.container.innerHTML = cached;
        target.container.classList.remove("mermaid-pending");
      }
      return missing;
    };

    if (!paintCached()) return;

    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          ...mermaidTheme(theme, root),
        });
        for (const [index, target] of targets.entries()) {
          if (cancelled) return;
          if (!target.container.classList.contains("mermaid-pending")) continue;
          const source = `${theme}\u0000${font}\u0000${fontSize}\u0000${target.code}`;
          const { svg } = await mermaid.render(
            `markview-mermaid-${Date.now()}-${index}`,
            target.code,
          );
          if (cancelled) return;
          target.container.innerHTML = svg;
          target.container.classList.remove("mermaid-pending");
          mermaidCache.set(target.key, source, svg, cacheBytes(svg));
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error);
        console.warn("mermaid render failed", error);
        targets.forEach(({ container }) => {
          container.classList.remove("mermaid-pending");
          container.textContent = `mermaid error: ${message}`;
        });
      }
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [html, active, theme, previewFont, previewFontSize, renderMermaidOn]);

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
      const view = editorRef.view;
      if (!inline || !view) {
        setInline(null);
        return;
      }
      try {
        const from = view.state.doc.line(inline.startLine + 1).from;
        const to = view.state.doc.line(inline.endLine + 1).to;
        view.dispatch({ changes: { from, to, insert: value } });
      } catch {
        /* line range changed underneath us */
      }
      setInline(null);
      window.dispatchEvent(new Event("markview:preview-update"));
    },
    [inline],
  );

  const statusLabel =
    renderStatus === "updating"
      ? "Updating"
      : renderStatus === "paused"
        ? "Paused"
        : "Live";
  const statusClass =
    renderStatus === "updating"
      ? " live-badge waiting"
      : renderStatus === "paused"
        ? " live-badge paused"
        : " live-badge";

  return (
    <div id="preview-panel" className={hidden ? "hidden" : ""} ref={panelRef}>
      <div className="pane-bar preview-bar">
        <span className="pane-title">Preview</span>
        <span className={statusClass.trim()}>
          <i />
          {statusLabel}
        </span>
        <div className="bar-spacer" />
        <span className="bar-label">Markdown</span>
      </div>
      {largeTier && (
        <div className="preview-notice">
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <span>
            {largeTier === "huge"
              ? "Preview disabled for very large documents"
              : "Large document — preview updates after you pause"}
            <span className="preview-notice-size">
              {formatSize(largeBytes)}
            </span>
          </span>
          <button type="button" onClick={forceRender}>
            {largeTier === "huge" ? "Render preview" : "Update preview"}
          </button>
        </div>
      )}
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
            (largeTier === "huge"
              ? '<p style="color:var(--text-muted)">Preview is disabled for this large document. Use “Render preview” to build it once.</p>'
              : '<p style="color:var(--text-muted)">Preview will appear here...</p>'),
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

function highlightCode(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("pre code").forEach((block) => {
    if (block.classList.contains("language-mermaid")) return;
    if (block.dataset.hljs === "1") return;

    const language =
      Array.from(block.classList)
        .find((name) => name.startsWith("language-"))
        ?.slice("language-".length) ?? "plaintext";
    const source = block.textContent ?? "";
    const key = previewCacheKey("hljs", `${language}\u0000${source}`);
    let highlighted = highlightCache.get(key, source);
    if (highlighted === undefined) {
      const resolved = hljs.getLanguage(language) ? language : "plaintext";
      try {
        highlighted = hljs.highlight(source, {
          language: resolved,
          ignoreIllegals: true,
        }).value;
      } catch {
        highlighted = hljs.highlight(source, { language: "plaintext" }).value;
      }
      highlightCache.set(key, source, highlighted, cacheBytes(highlighted));
    }
    block.innerHTML = highlighted;
    block.dataset.hljs = "1";
    block.classList.add("hljs");
  });
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
    img.loading = "lazy";
    img.decoding = "async";
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

function mathHtml(tex: string, display: boolean): string {
  const source = `${display ? "D" : "I"}\u0000${tex}`;
  const key = previewCacheKey("math", source);
  const cached = mathCache.get(key, source);
  if (cached !== undefined) return cached;
  let html: string;
  try {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
    });
  } catch {
    html = `<span class="katex-error">${tex}</span>`;
  }
  mathCache.set(key, source, html, cacheBytes(html));
  return html;
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
    span.innerHTML = mathHtml(match[1].trim(), true);
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
      span.innerHTML = mathHtml(tex, display);
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
