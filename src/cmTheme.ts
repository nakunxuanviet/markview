import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/* Aurora — dark editor palette */
const darkHighlight = HighlightStyle.define([
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: "#f1f4fc", fontWeight: "700" },
  { tag: t.strong, color: "#f1f4fc", fontWeight: "700" },
  { tag: t.emphasis, color: "#7ee7d8", fontStyle: "italic" },
  { tag: t.strikethrough, color: "#5d6684", textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "#7dd3fc", textDecoration: "underline" },
  { tag: t.monospace, color: "#6ee7b7" },
  { tag: [t.keyword, t.processingInstruction], color: "#b8a7ff" },
  { tag: [t.string, t.special(t.string)], color: "#6ee7b7" },
  { tag: [t.atom, t.bool, t.null], color: "#fbbf24" },
  { tag: t.number, color: "#fbbf24" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#5d6684", fontStyle: "italic" },
  { tag: [t.typeName, t.className], color: "#fbbf24" },
  { tag: [t.variableName, t.propertyName], color: "#c9d2e7" },
  { tag: t.operator, color: "#22d3ee" },
  { tag: t.punctuation, color: "#5d6684" },
  { tag: t.meta, color: "#5d6684" },
  { tag: t.quote, color: "#8b93ad", fontStyle: "italic" },
  { tag: t.tagName, color: "#f472b6" },
]);

/* Editorial — light editor palette */
const lightHighlight = HighlightStyle.define([
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: "#16150f", fontWeight: "700" },
  { tag: t.strong, color: "#16150f", fontWeight: "700" },
  { tag: t.emphasis, color: "#4d6b57", fontStyle: "italic" },
  { tag: t.strikethrough, color: "#a49d8f", textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "#a9491f", textDecoration: "underline" },
  { tag: t.monospace, color: "#4d6b57" },
  { tag: [t.keyword, t.processingInstruction], color: "#a9491f" },
  { tag: [t.string, t.special(t.string)], color: "#4d6b57" },
  { tag: [t.atom, t.bool, t.null], color: "#8a5a33" },
  { tag: t.number, color: "#8a5a33" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#a49d8f", fontStyle: "italic" },
  { tag: [t.typeName, t.className], color: "#4d6b57" },
  { tag: [t.variableName, t.propertyName], color: "#35322b" },
  { tag: t.operator, color: "#6b6559" },
  { tag: t.punctuation, color: "#a49d8f" },
  { tag: t.meta, color: "#9b9587" },
  { tag: t.quote, color: "#8e8778", fontStyle: "italic" },
  { tag: t.tagName, color: "#a33a2a" },
]);

const mono =
  '"Cascadia Code", "JetBrains Mono", Consolas, "Courier New", monospace';

const darkBase = EditorView.theme(
  {
    "&": { backgroundColor: "#0a0e18", color: "#c9d2e7", height: "100%" },
    "&.cm-focused": { outline: "none" },
    ".cm-content": {
      caretColor: "#a78bfa",
      padding: "10px 0 40vh",
      fontFamily: "inherit",
    },
    ".cm-line": { padding: "0 26px 0 10px" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#a78bfa", borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(124, 92, 255, 0.28)",
    },
    ".cm-panels": { backgroundColor: "#0e1422", color: "#c9d2e7" },
    ".cm-gutters": {
      backgroundColor: "#0a0e18",
      color: "#414b66",
      border: "none",
      paddingLeft: "12px",
      paddingRight: "6px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      fontFamily: mono,
      fontSize: "10.5px",
      minWidth: "26px",
      padding: "0 8px 0 0",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.032)" },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#98a3bf",
    },
    ".cm-selectionMatch": { backgroundColor: "rgba(34, 211, 238, 0.16)" },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "rgba(124, 92, 255, 0.22)",
      outline: "1px solid rgba(124, 92, 255, 0.45)",
    },
    ".cm-tooltip": {
      backgroundColor: "#101728",
      border: "1px solid rgba(255, 255, 255, 0.14)",
      borderRadius: "10px",
      color: "#e9ecf6",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "rgba(124, 92, 255, 0.22)",
      color: "#ffffff",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      border: "none",
      color: "#98a3bf",
    },
    ".cm-searchMatch": { backgroundColor: "rgba(251, 191, 36, 0.22)" },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(251, 191, 36, 0.38)",
    },
  },
  { dark: true },
);

const lightBase = EditorView.theme(
  {
    "&": { backgroundColor: "#fffdf9", color: "#35322b", height: "100%" },
    "&.cm-focused": { outline: "none" },
    ".cm-content": {
      caretColor: "#b0512a",
      padding: "12px 0 40vh",
      fontFamily: "inherit",
    },
    ".cm-line": { padding: "0 26px 0 10px" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#b0512a", borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#ead9c9",
    },
    ".cm-panels": { backgroundColor: "#faf8f2", color: "#35322b" },
    ".cm-gutters": {
      backgroundColor: "#fffdf9",
      color: "#b3ac9d",
      border: "none",
      paddingLeft: "12px",
      paddingRight: "6px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      fontFamily: mono,
      fontSize: "10.5px",
      minWidth: "26px",
      padding: "0 8px 0 0",
    },
    ".cm-activeLine": { backgroundColor: "rgba(27, 26, 22, 0.028)" },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#6b6559",
    },
    ".cm-selectionMatch": { backgroundColor: "rgba(176, 81, 42, 0.12)" },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "rgba(176, 81, 42, 0.12)",
      outline: "1px solid rgba(176, 81, 42, 0.35)",
    },
    ".cm-tooltip": {
      backgroundColor: "#fcfaf5",
      border: "1px solid #e6e1d5",
      borderRadius: "2px",
      color: "#1b1a16",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "#f4e7dd",
      color: "#1b1a16",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#ece5d6",
      border: "none",
      color: "#6b6559",
    },
    ".cm-searchMatch": { backgroundColor: "#f2e3c3" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#ead9c9" },
  },
  { dark: false },
);

export const darkTheme = [darkBase, syntaxHighlighting(darkHighlight)];
export const lightTheme = [lightBase, syntaxHighlighting(lightHighlight)];
