import type { ReactNode } from "react";

import { applyFormat } from "../format";
import { editorRef } from "../editorRef";
import {
  IconImage,
  IconLink,
  IconList,
  IconMinus,
  IconOrderedList,
  IconQuote,
  IconTable,
} from "../icons";
import { useStore } from "../store";

const FORMATS: { key: string; title: string; content: ReactNode }[] = [
  { key: "bold", title: "Bold (Ctrl+B)", content: <b>B</b> },
  { key: "italic", title: "Italic (Ctrl+I)", content: <i>I</i> },
  { key: "strikethrough", title: "Strikethrough", content: <s>S</s> },
  { key: "code", title: "Code (Ctrl+Shift+K)", content: <code>&lt;/&gt;</code> },
  { key: "link", title: "Link (Ctrl+K)", content: <IconLink /> },
  { key: "image", title: "Image", content: <IconImage /> },
  { key: "heading", title: "Heading", content: <span className="h-glyph">H</span> },
  { key: "ul", title: "Bullet list", content: <IconList /> },
  { key: "ol", title: "Numbered list", content: <IconOrderedList /> },
  { key: "quote", title: "Blockquote", content: <IconQuote /> },
  { key: "table", title: "Table", content: <IconTable /> },
  { key: "hr", title: "Horizontal rule", content: <IconMinus /> },
];

export function FormatBar() {
  const showToolbar = useStore((state) => state.settings.appearance.show_toolbar);
  const activeId = useStore((state) => state.activeId);
  const tabs = useStore((state) => state.tabs);

  if (!showToolbar) return null;

  const active = activeId ? tabs[activeId] : undefined;
  const ext = active?.filename.split(".").pop()?.toLowerCase();
  const label = ext === "md" || ext === "markdown" || ext === "mdx" ? "Markdown" : ext ? ext.toUpperCase() : "Markdown";

  return (
    <div className="pane-bar editor-bar" id="formatting-toolbar">
      <div className="tools">
        {FORMATS.map((format, index) => (
          <span key={format.key} style={{ display: "contents" }}>
            {index === 6 ? <span className="tool-sep" /> : null}
            <button
              className="tool-btn"
              data-format={format.key}
              title={format.title}
              onClick={() => applyFormat(editorRef.view, format.key)}
            >
              {format.content}
            </button>
          </span>
        ))}
      </div>
      <div className="bar-spacer" />
      <span className="bar-label">{label}</span>
    </div>
  );
}
