export interface MenuItem {
  label?: string;
  shortcut?: string;
  separator?: boolean;
  action?: () => void;
}

type ShowFn = (items: MenuItem[], x: number, y: number) => void;

let showFn: ShowFn | null = null;

export const contextMenu = {
  register(fn: ShowFn): () => void {
    showFn = fn;
    return () => {
      showFn = null;
    };
  },
  show(
    event: { clientX: number; clientY: number; preventDefault: () => void },
    items: MenuItem[],
  ): void {
    event.preventDefault();
    showFn?.(items, event.clientX, event.clientY);
  },
};
