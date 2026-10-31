import type { Text } from "@codemirror/state";

type Listener = (tabId: string, doc: Text) => void;

const listeners = new Set<Listener>();

/**
 * Lightweight pub/sub for editor text changes.
 * Keeps the global store free of per-keystroke updates so only the preview,
 * status bar and outline react to typing. `Text` is immutable and cheap to
 * pass; consumers stringify only when they actually need the text.
 */
export const editorBus = {
  emit(tabId: string, doc: Text) {
    for (const listener of listeners) listener(tabId, doc);
  },
  on(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
