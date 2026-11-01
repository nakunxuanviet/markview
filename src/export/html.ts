import katex from "katex";

import exportCss from "../styles/export.css?inline";
import hljsDark from "highlight.js/styles/github-dark.css?inline";
import hljsLight from "highlight.js/styles/github.css?inline";
import { useStore } from "../store";

export interface ExportOptions {
  theme: "dark" | "light";
  includeToc: boolean;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function isPlaceholder(root: HTMLElement, tabId: string): boolean {
  const text = root.textContent ?? "";
  return (
    root.dataset.previewTab !== tabId ||
    root.innerHTML.trim() === "" ||
    text.includes("Preview will appear here") ||
    text.includes("Preview is disabled")
  );
}

function restoreMode(mode: "single" | "split", single: "editor" | "preview") {
  const store = useStore.getState();
  if (mode === "single") store.showSingleView(single);
  else store.setViewMode("split");
}

/**
 * Export reads the already-rendered preview DOM so KaTeX/Mermaid/highlight
 * output matches what the user sees. WRITE mode normally skips rendering, so
 * temporarily switch to split and wait for the scheduler.
 */
export async function buildExportHtml(options: ExportOptions): Promise<string> {
  const state = useStore.getState();
  const tab = state.activeId ? state.tabs[state.activeId] : null;
  if (!tab) throw new Error("No active document");

  let panel = document.getElementById("preview-content");
  if (!panel) throw new Error("Preview is not available");

  if (isPlaceholder(panel, tab.id)) {
    if ((panel.textContent ?? "").includes("Preview is disabled")) {
      throw new Error(
        "Preview is disabled for this large document. Open Read mode and render it first.",
      );
    }
    const previousMode = state.viewMode;
    const previousSingle = state.singleView;
    if (previousMode === "single" && previousSingle === "editor") {
      state.setViewMode("split");
    }

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      panel = document.getElementById("preview-content");
      if (panel && !isPlaceholder(panel, tab.id)) break;
    }

    restoreMode(previousMode, previousSingle);
    if (!panel || isPlaceholder(panel, tab.id)) {
      throw new Error("Preview is still rendering. Try again in a moment.");
    }
  }

  const root = panel;
  if (root.querySelector(".mermaid-pending")) {
    throw new Error("A diagram is still rendering. Try again in a moment.");
  }

  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".code-copy").forEach((button) => button.remove());

  // KaTeX HTML needs its own fonts; MathML keeps the export self-contained.
  clone.querySelectorAll<HTMLElement>(".katex").forEach((node) => {
    const tex = node.querySelector(
      'annotation[encoding="application/x-tex"]',
    )?.textContent;
    if (!tex) return;
    try {
      const mathml = katex.renderToString(tex, {
        output: "mathml",
        throwOnError: false,
      });
      const span = document.createElement("span");
      span.innerHTML = mathml;
      node.replaceWith(span);
    } catch {
      /* keep the existing markup */
    }
  });

  if (options.includeToc) {
    const headings = [...clone.querySelectorAll<HTMLElement>("h1, h2, h3")];
    if (headings.length > 0) {
      const nav = document.createElement("nav");
      nav.className = "toc";
      const title = document.createElement("div");
      title.className = "toc-title";
      title.textContent = "Contents";
      nav.appendChild(title);
      const list = document.createElement("ol");
      headings.forEach((heading, index) => {
        if (!heading.id)
          heading.id = `${slugify(heading.textContent ?? "")}-${index}`;
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = `#${heading.id}`;
        link.textContent = (heading.textContent ?? "").trim();
        item.appendChild(link);
        list.appendChild(item);
      });
      nav.appendChild(list);
      clone.prepend(nav);
    }
  }

  // Embed local preview images so the exported file works offline.
  const images = [...clone.querySelectorAll<HTMLImageElement>("img")];
  let embeddedBytes = 0;
  for (const image of images) {
    const src = image.getAttribute("src") ?? "";
    if (!/^(http:\/\/markview\.localhost|markview:)/i.test(src)) continue;
    if (embeddedBytes > 100 * 1024 * 1024) break;
    try {
      const response = await fetch(src);
      if (!response.ok) continue;
      const blob = await response.blob();
      if (blob.size > 20 * 1024 * 1024) continue;
      embeddedBytes += blob.size;
      image.src = await fileToDataUrl(blob);
      image.removeAttribute("srcset");
    } catch {
      /* keep the original src if embedding fails */
    }
  }

  clone.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    anchor.setAttribute("rel", "noopener noreferrer");
  });

  const hljsCss = options.theme === "dark" ? hljsDark : hljsLight;
  const title = (tab.filename || "MarkView export").replace(/\.[^.]+$/, "");
  const date = new Date().toISOString().slice(0, 10);

  return `<!doctype html>
<html lang="en" data-theme="${options.theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${exportCss}</style>
<style>${hljsCss}</style>
</head>
<body>
<main class="markdown-body">${clone.innerHTML}</main>
<footer class="export-footer">Exported by MarkView · ${date}</footer>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function printHtml(html: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Could not prepare the print view");
  }
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((resolve) => {
    if (doc.readyState === "complete") resolve(null);
    else frame.onload = () => resolve(null);
    window.setTimeout(() => resolve(null), 1500);
  });
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  window.setTimeout(() => frame.remove(), 60_000);
}
