import { describe, expect, it } from "vitest";

import {
  countWords,
  formatSize,
  normalizePath,
  resolveRelative,
} from "./utils";

describe("resolveRelative", () => {
  it("resolves siblings and parent segments", () => {
    expect(resolveRelative("C:/docs/a.md", "img.png")).toBe("C:/docs/img.png");
    expect(resolveRelative("C:/docs/notes/a.md", "../img.png")).toBe(
      "C:/docs/img.png",
    );
  });

  it("keeps external schemes untouched", () => {
    expect(resolveRelative("C:/docs/a.md", "https://example.com/x")).toBe(
      "https://example.com/x",
    );
    expect(resolveRelative("C:/docs/a.md", "C:/other/x.png")).toBe(
      "C:/other/x.png",
    );
  });

  it("rejects network-path and UNC references", () => {
    expect(resolveRelative("C:/docs/a.md", "//evil.example/x.png")).toBe("");
    expect(resolveRelative("C:/docs/a.md", String.raw`\\evil\share\x.md`)).toBe(
      "",
    );
    expect(resolveRelative("C:/docs/a.md", String.raw`\/evil\share\x.md`)).toBe(
      "",
    );
  });
});

describe("path and text helpers", () => {
  it("normalizes Windows separators and case", () => {
    expect(normalizePath("C:\\Docs\\A.MD")).toBe("c:/docs/a.md");
  });

  it("counts words without counting whitespace", () => {
    expect(countWords("  one two\nthree  ")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });

  it("formats sizes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2.0 KB");
  });
});
