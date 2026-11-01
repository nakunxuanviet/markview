import type { EditorView } from "@codemirror/view";

export interface EditorBridge {
  view: EditorView | null;
  /** Replace the whole document without marking it as a user edit. */
  setDoc?: (content: string) => void;
  scrollToLine?: (line: number) => void;
  focus?: () => void;
  insertText?: (text: string) => void;
}

/** Shared handle so dialogs (find bar, command palette, toolbar) reach the editor. */
export const editorRef: EditorBridge = { view: null };
