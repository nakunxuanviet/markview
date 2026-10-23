import hljsDark from "highlight.js/styles/github-dark.css?inline";
import hljsLight from "highlight.js/styles/github.css?inline";
import darkThemeCss from "./styles/theme-dark.css?inline";
import lightThemeCss from "./styles/theme-light.css?inline";

import type { Theme } from "./types";

function ensureStyle(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

/**
 * Themes are injected at runtime so switching does not require reloading
 * stylesheet links (as the original pywebview app did).
 */
export function applyTheme(theme: Theme) {
  ensureStyle("theme-vars").textContent =
    theme === "dark" ? darkThemeCss : lightThemeCss;
  ensureStyle("hljs-theme").textContent = theme === "dark" ? hljsDark : hljsLight;
  document.body.dataset.theme = theme;
}

export function applyAppearance(settings: {
  font_family_editor: string;
  font_family_preview: string;
  font_size_editor: number;
  font_size_preview: number;
  show_toolbar: boolean;
  show_statusbar: boolean;
}) {
  const root = document.documentElement.style;
  root.setProperty("--font-editor", settings.font_family_editor);
  root.setProperty("--font-preview", settings.font_family_preview);
  root.setProperty("--font-size-editor", `${settings.font_size_editor}px`);
  root.setProperty("--font-size-preview", `${settings.font_size_preview}px`);
  document.body.classList.toggle("no-toolbar", !settings.show_toolbar);
  document.body.classList.toggle("no-statusbar", !settings.show_statusbar);
}
