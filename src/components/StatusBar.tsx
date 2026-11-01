import { useEffect, useState } from "react";

import { COPYRIGHT } from "../branding";
import { useStore } from "../store";
import { formatSize } from "../utils";
import type { LineEnding } from "../types";

interface StatusDetail {
  line: number;
  col: number;
  words: number;
  chars: number;
  bytes: number;
}

const ENCODINGS = [
  "UTF-8",
  "UTF-8 BOM",
  "UTF-16 LE",
  "UTF-16 BE",
  "Windows-1252",
  "Shift_JIS",
];

const LINE_ENDINGS: { value: LineEnding; label: string }[] = [
  { value: "lf", label: "LF" },
  { value: "crlf", label: "CRLF" },
  { value: "cr", label: "CR" },
];

function filetypeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md":
    case "markdown":
    case "mdx":
      return "Markdown";
    case "txt":
      return "Plain Text";
    case "json":
      return "JSON";
    case "html":
      return "HTML";
    case "css":
      return "CSS";
    case "js":
      return "JavaScript";
    case "ts":
      return "TypeScript";
    case "py":
      return "Python";
    default:
      return ext ? ext.toUpperCase() : "Markdown";
  }
}

export function StatusBar() {
  const [status, setStatus] = useState<StatusDetail>({
    line: 1,
    col: 1,
    words: 0,
    chars: 0,
    bytes: 0,
  });
  const [openMenu, setOpenMenu] = useState<"encoding" | "lineEnding" | null>(
    null,
  );
  const activeTab = useStore((state) =>
    state.activeId ? (state.tabs[state.activeId] ?? null) : null,
  );
  const showStatusbar = useStore(
    (state) => state.settings.appearance.show_statusbar,
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<StatusDetail>).detail;
      if (detail) setStatus(detail);
    };
    window.addEventListener("markview:status", handler);
    return () => window.removeEventListener("markview:status", handler);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const onPointer = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".status-format")) {
        setOpenMenu(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  if (!showStatusbar) return null;

  const encoding = activeTab?.encoding ?? "UTF-8";
  const lineEnding = activeTab?.lineEnding ?? "lf";
  const mixed = activeTab?.mixedLineEndings ?? false;
  const eolLabel = mixed
    ? `Mixed (${LINE_ENDINGS.find((item) => item.value === lineEnding)?.label ?? "LF"})`
    : (LINE_ENDINGS.find((item) => item.value === lineEnding)?.label ?? "LF");

  const setFormat = (patch: {
    encoding?: string;
    bom?: boolean;
    lineEnding?: LineEnding;
  }) => {
    if (!activeTab) return;
    useStore.getState().setTabFormat(activeTab.id, patch);
    setOpenMenu(null);
  };

  return (
    <div id="status-bar">
      <div className="status-left">
        <span id="status-position">
          Ln {status.line}, Col {status.col}
        </span>
        <span className="status-sep" />
        <span id="status-words">{status.words} words</span>
        <span className="status-sep" />
        <span id="status-size">{formatSize(status.bytes)}</span>
        {activeTab?.modified && (
          <>
            <span className="status-sep" />
            <span id="status-modified">
              <i />
              Unsaved
            </span>
          </>
        )}
      </div>
      <div className="status-right">
        <span id="status-copyright" title={`Copyright ${COPYRIGHT}`}>
          {COPYRIGHT}
        </span>
        <span className="status-sep" />
        <span className="status-format">
          <button
            type="button"
            className={`status-format-btn${openMenu === "encoding" ? " on" : ""}`}
            title="File encoding"
            disabled={!activeTab}
            onClick={() =>
              setOpenMenu(openMenu === "encoding" ? null : "encoding")
            }
          >
            {encoding}
            <span className="status-chevron">▾</span>
          </button>
          {openMenu === "encoding" && (
            <div className="status-format-menu">
              <div className="status-format-head">Encoding</div>
              {ENCODINGS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="status-format-item"
                  onClick={() =>
                    setFormat({
                      encoding: value,
                      bom: value === "UTF-8 BOM" || value.startsWith("UTF-16"),
                    })
                  }
                >
                  <span className="check">{encoding === value ? "✓" : ""}</span>
                  {value}
                </button>
              ))}
              <div className="status-format-note">
                Applied on the next save. Characters that cannot be represented
                will block the save.
              </div>
            </div>
          )}
        </span>
        <span className="status-sep" />
        <span className="status-format">
          <button
            type="button"
            className={`status-format-btn${openMenu === "lineEnding" ? " on" : ""}${
              mixed ? " mixed" : ""
            }`}
            title="Line endings"
            disabled={!activeTab}
            onClick={() =>
              setOpenMenu(openMenu === "lineEnding" ? null : "lineEnding")
            }
          >
            {eolLabel}
            <span className="status-chevron">▾</span>
          </button>
          {openMenu === "lineEnding" && (
            <div className="status-format-menu">
              <div className="status-format-head">Line endings</div>
              {LINE_ENDINGS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="status-format-item"
                  onClick={() => setFormat({ lineEnding: item.value })}
                >
                  <span className="check">
                    {lineEnding === item.value ? "✓" : ""}
                  </span>
                  {item.label}
                </button>
              ))}
              <div className="status-format-note">
                New files use the defaults from Settings. Existing files keep
                their original format until you change it.
              </div>
            </div>
          )}
        </span>
        <span className="status-sep" />
        <span id="status-filetype">
          {filetypeFor(activeTab?.filename ?? "Untitled")}
        </span>
      </div>
    </div>
  );
}
