import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, sanitizeSettings } from "./store";
import type { AppSettings } from "./types";

describe("sanitizeSettings", () => {
  it("repairs corrupt arrays and clamps invalid numeric values", () => {
    const bad = {
      ...DEFAULT_SETTINGS,
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        theme: "weird",
        font_size_editor: 0,
        sidebar_width: "999",
        zoom_level: null,
      },
      files: {
        ...DEFAULT_SETTINGS.files,
        visible_extensions: "not-an-array",
        exclude_patterns: null,
        auto_save_interval: 0,
        folder_label_segments: 99,
      },
      recent_files: "oops",
      recent_folders: [1, "C:/notes", null],
    } as unknown as AppSettings;

    const clean = sanitizeSettings(bad);
    expect(clean.appearance.theme).toBe("dark");
    expect(clean.appearance.font_size_editor).toBe(10);
    expect(clean.appearance.sidebar_width).toBe(500);
    expect(clean.appearance.zoom_level).toBe(1);
    expect(clean.files.visible_extensions).toEqual(
      DEFAULT_SETTINGS.files.visible_extensions,
    );
    expect(clean.files.exclude_patterns).toEqual(
      DEFAULT_SETTINGS.files.exclude_patterns,
    );
    expect(clean.files.auto_save_interval).toBe(5);
    expect(clean.files.folder_label_segments).toBe(6);
    expect(clean.recent_files).toEqual([]);
    expect(clean.recent_folders).toEqual(["C:/notes"]);
  });

  it("preserves valid values and unknown forward-compatible keys", () => {
    const clean = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        theme: "light",
        font_size_editor: 18,
      },
      recent_files: ["C:/notes/a.md"],
      future_section: { enabled: true },
    });
    expect(clean.appearance.theme).toBe("light");
    expect(clean.appearance.font_size_editor).toBe(18);
    expect(clean.recent_files).toEqual(["C:/notes/a.md"]);
    expect(clean.future_section).toEqual({ enabled: true });
  });
});
