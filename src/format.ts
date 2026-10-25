import type { EditorView } from "@codemirror/view";

function replaceSelection(view: EditorView, insert: string, selectFrom: number, selectTo: number) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + selectFrom, head: from + selectTo },
    scrollIntoView: true,
  });
  view.focus();
}

function wrap(view: EditorView, before: string, after: string, placeholder: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to) || placeholder;
  const insert = `${before}${selected}${after}`;
  replaceSelection(view, insert, before.length, before.length + selected.length);
}

function prefixLines(view: EditorView, prefix: string) {
  const { from, to } = view.state.selection.main;
  const first = view.state.doc.lineAt(from).number;
  const last = view.state.doc.lineAt(to).number;
  const changes = [];
  for (let n = first; n <= last; n += 1) {
    const line = view.state.doc.line(n);
    changes.push({ from: line.from, insert: prefix });
  }
  view.dispatch({ changes, scrollIntoView: true });
  view.focus();
}

function insertBlock(view: EditorView, text: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const needsLeading = line.text.trim().length > 0;
  const insert = `${needsLeading ? "\n\n" : ""}${text}\n`;
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
    scrollIntoView: true,
  });
  view.focus();
}

const TABLE = `| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
| Cell | Cell | Cell |`;

export function applyFormat(view: EditorView | null, kind: string) {
  if (!view) return;
  switch (kind) {
    case "bold":
      wrap(view, "**", "**", "bold text");
      break;
    case "italic":
      wrap(view, "*", "*", "italic text");
      break;
    case "strikethrough":
      wrap(view, "~~", "~~", "strikethrough");
      break;
    case "code":
      wrap(view, "`", "`", "code");
      break;
    case "link": {
      const { from, to } = view.state.selection.main;
      const text = view.state.sliceDoc(from, to) || "link text";
      const insert = `[${text}](url)`;
      const urlStart = 1 + text.length + 2;
      replaceSelection(view, insert, urlStart, urlStart + 3);
      break;
    }
    case "image":
      replaceSelection(view, "![alt text](image.png)", 11, 22);
      break;
    case "heading":
      prefixLines(view, "## ");
      break;
    case "ul":
      prefixLines(view, "- ");
      break;
    case "ol":
      prefixLines(view, "1. ");
      break;
    case "quote":
      prefixLines(view, "> ");
      break;
    case "table":
      insertBlock(view, TABLE);
      break;
    case "hr":
      insertBlock(view, "---");
      break;
    default:
      break;
  }
}
