/** Preview scheduling thresholds. Tuned against the 2026-10 audit. */
export const PREVIEW_TIERS = {
  normal: 256 * 1024,
  large: 1 * 1024 * 1024,
  idle: 4 * 1024 * 1024,
} as const;

export const PREVIEW_DEBOUNCE = {
  normal: 350,
  large: 600,
  idle: 2_500,
} as const;

export const PREVIEW_MAX_WAIT = {
  normal: 2_000,
  large: 3_000,
  idle: 0,
} as const;

/** Delay before Mermaid is allowed to touch the DOM. */
export const PREVIEW_MERMAID_DELAY = {
  normal: 600,
  large: 1_500,
  idle: 2_500,
} as const;

/** Per-tab EditorState cache (undo history). */
export const EDITOR_STATE_CACHE = {
  maxStates: 8,
  maxBytes: 64 * 1024 * 1024,
  /** Tab content larger than this is not cached across tab switches. */
  maxDocumentBytes: 2 * 1024 * 1024,
} as const;

export type PreviewTier = "normal" | "large" | "idle" | "huge";

export function previewTier(length: number): PreviewTier {
  if (length <= PREVIEW_TIERS.normal) return "normal";
  if (length <= PREVIEW_TIERS.large) return "large";
  if (length <= PREVIEW_TIERS.idle) return "idle";
  return "huge";
}
