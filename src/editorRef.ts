import type { EditorView } from "@codemirror/view";

export interface EditorBridge {
  view: EditorView | null;
  /** Replace the whole document without marking it as a user edit. */
  setDoc?: (content: string) => void;
  /** Restore cursor + scroll without marking a user edit. */
  restore?: (cursor: number, scrollTop: number) => void;
  getCursor?: () => number;
  getScroll?: () => number;
  scrollToLine?: (line: number) => void;
  focus?: () => void;
  insertText?: (text: string) => void;
}

/** Shared handle so dialogs (find bar, command palette, toolbar) reach the editor. */
export const editorRef: EditorBridge = { view: null };
