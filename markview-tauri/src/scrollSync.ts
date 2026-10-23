let editorEl: HTMLElement | null = null;
let previewEl: HTMLElement | null = null;
let enabled = true;
let syncing = false;

function ratio(el: HTMLElement): number {
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? el.scrollTop / max : 0;
}

function applyRatio(el: HTMLElement, value: number) {
  const max = el.scrollHeight - el.clientHeight;
  el.scrollTop = Math.max(0, Math.min(1, value)) * max;
}

function sync(source: HTMLElement, target: HTMLElement | null) {
  if (!enabled || syncing || !target) return;
  syncing = true;
  requestAnimationFrame(() => {
    applyRatio(target, ratio(source));
    // Release on the next frame so the programmatic scroll does not echo back.
    requestAnimationFrame(() => {
      syncing = false;
    });
  });
}

const onEditorScroll = () => {
  if (editorEl) sync(editorEl, previewEl);
};
const onPreviewScroll = () => {
  if (previewEl) sync(previewEl, editorEl);
};

export function registerEditorScroller(el: HTMLElement | null) {
  if (editorEl) editorEl.removeEventListener("scroll", onEditorScroll);
  editorEl = el;
  el?.addEventListener("scroll", onEditorScroll, { passive: true });
}

export function registerPreviewScroller(el: HTMLElement | null) {
  if (previewEl) previewEl.removeEventListener("scroll", onPreviewScroll);
  previewEl = el;
  el?.addEventListener("scroll", onPreviewScroll, { passive: true });
}

export function setScrollSyncEnabled(value: boolean) {
  enabled = value;
}
