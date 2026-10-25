export type ToastKind = "info" | "success" | "warn" | "error";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  duration: number;
  visible: boolean;
}

export interface ConfirmItem {
  id: number;
  message: string;
  confirmText: string;
  cancelText: string;
  resolve: (value: boolean) => void;
}

export type CloseChoice = "save" | "discard" | "cancel";

export interface ChoiceItem {
  id: number;
  message: string;
  saveText: string;
  discardText: string;
  cancelText: string;
  resolve: (value: CloseChoice) => void;
}

type Listener = (state: {
  toasts: ToastItem[];
  confirms: ConfirmItem[];
  choices: ChoiceItem[];
}) => void;

let toasts: ToastItem[] = [];
let confirms: ConfirmItem[] = [];
let choices: ChoiceItem[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) {
    listener({
      toasts: [...toasts],
      confirms: [...confirms],
      choices: [...choices],
    });
  }
}

function removeToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  show(
    message: string,
    opts: { duration?: number; type?: ToastKind } = {},
  ): void {
    const item: ToastItem = {
      id: ++seq,
      message,
      kind: opts.type ?? "info",
      duration: opts.duration ?? 3000,
      visible: false,
    };
    toasts = [...toasts, item];
    emit();
    // Force a frame so the enter transition plays.
    requestAnimationFrame(() => {
      toasts = toasts.map((t) =>
        t.id === item.id ? { ...t, visible: true } : t,
      );
      emit();
    });
    if (item.duration > 0) {
      setTimeout(() => removeToast(item.id), item.duration);
    }
  },

  dismiss(id: number): void {
    removeToast(id);
  },

  confirm(
    message: string,
    opts: { confirmText?: string; cancelText?: string } = {},
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const item: ConfirmItem = {
        id: ++seq,
        message,
        confirmText: opts.confirmText ?? "OK",
        cancelText: opts.cancelText ?? "Cancel",
        resolve,
      };
      confirms = [...confirms, item];
      emit();
    });
  },

  answer(id: number, value: boolean): void {
    const item = confirms.find((c) => c.id === id);
    confirms = confirms.filter((c) => c.id !== id);
    emit();
    item?.resolve(value);
  },

  /** Three-way prompt for unsaved changes: save, discard, or keep editing. */
  choose(
    message: string,
    opts: {
      saveText?: string;
      discardText?: string;
      cancelText?: string;
    } = {},
  ): Promise<CloseChoice> {
    return new Promise<CloseChoice>((resolve) => {
      const item: ChoiceItem = {
        id: ++seq,
        message,
        saveText: opts.saveText ?? "Save",
        discardText: opts.discardText ?? "Don't Save",
        cancelText: opts.cancelText ?? "Cancel",
        resolve,
      };
      choices = [...choices, item];
      emit();
    });
  },

  answerChoice(id: number, value: CloseChoice): void {
    const item = choices.find((c) => c.id === id);
    choices = choices.filter((c) => c.id !== id);
    emit();
    item?.resolve(value);
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener({
      toasts: [...toasts],
      confirms: [...confirms],
      choices: [...choices],
    });
    return () => listeners.delete(listener);
  },
};
