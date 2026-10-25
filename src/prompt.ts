export interface PromptRequest {
  id: number;
  title: string;
  initial: string;
  confirmText: string;
  resolve: (value: string | null) => void;
}

type Listener = (request: PromptRequest | null) => void;

let current: PromptRequest | null = null;
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(current);
}

export function promptText(
  title: string,
  initial = "",
  confirmText = "OK",
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    current = { id: ++seq, title, initial, confirmText, resolve };
    emit();
  });
}

export function answerPrompt(value: string | null) {
  const request = current;
  current = null;
  emit();
  request?.resolve(value);
}

export function subscribePrompt(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
