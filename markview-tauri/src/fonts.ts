export interface FontOption {
  label: string;
  value: string;
}

/**
 * Curated families instead of a free-text field: every stack has a sensible
 * fallback, so a missing font never turns the editor or preview unreadable.
 */
export const EDITOR_FONTS: FontOption[] = [
  {
    label: "Cascadia Code",
    value: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
  },
  {
    label: "JetBrains Mono",
    value: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
  },
  {
    label: "Fira Code",
    value: '"Fira Code", "Cascadia Code", Consolas, monospace',
  },
  {
    label: "Consolas",
    value: 'Consolas, "Cascadia Mono", monospace',
  },
  {
    label: "IBM Plex Mono",
    value: '"IBM Plex Mono", Consolas, monospace',
  },
  {
    label: "Source Code Pro",
    value: '"Source Code Pro", Consolas, monospace',
  },
  {
    label: "Lucida Console",
    value: '"Lucida Console", Monaco, monospace',
  },
  {
    label: "Courier New",
    value: '"Courier New", Courier, monospace',
  },
];

export const PREVIEW_FONTS: FontOption[] = [
  {
    label: "Segoe UI",
    value: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  },
  {
    label: "Inter",
    value: '"Inter", "Segoe UI", system-ui, sans-serif',
  },
  {
    label: "Arial",
    value: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  },
  {
    label: "Verdana",
    value: "Verdana, Geneva, sans-serif",
  },
  {
    label: "Tahoma",
    value: "Tahoma, Verdana, sans-serif",
  },
  {
    label: "Georgia",
    value: 'Georgia, "Times New Roman", serif',
  },
  {
    label: "Cambria",
    value: 'Cambria, Georgia, "Times New Roman", serif',
  },
  {
    label: "Palatino",
    value: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
  },
  {
    label: "Times New Roman",
    value: '"Times New Roman", Times, serif',
  },
  {
    label: "JetBrains Mono",
    value: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
  },
  {
    label: "Consolas",
    value: 'Consolas, "Cascadia Mono", monospace',
  },
];

/** Keep a previously saved custom stack selectable instead of dropping it. */
export function fontOptions(
  presets: FontOption[],
  current: string,
): FontOption[] {
  if (!current || presets.some((option) => option.value === current)) {
    return presets;
  }
  return [{ label: `Custom (${current})`, value: current }, ...presets];
}
