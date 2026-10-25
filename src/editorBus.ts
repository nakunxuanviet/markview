type Listener = (tabId: string, content: string) => void;

const listeners = new Set<Listener>();

/**
 * Lightweight pub/sub for editor text changes.
 * Keeps the global store free of per-keystroke updates so only the preview,
 * status bar and outline react to typing.
 */
export const editorBus = {
  emit(tabId: string, content: string) {
    for (const listener of listeners) listener(tabId, content);
  },
  on(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
