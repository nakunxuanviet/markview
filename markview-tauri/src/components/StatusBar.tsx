import { useEffect, useState } from "react";

import { COPYRIGHT } from "../branding";
import { useStore } from "../store";
import { formatSize } from "../utils";

interface StatusDetail {
  line: number;
  col: number;
  words: number;
  chars: number;
  bytes: number;
}

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

  if (!showStatusbar) return null;

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
        <span id="status-encoding" className="mono">
          {activeTab?.encoding ?? "UTF-8"}
        </span>
        <span className="status-sep" />
        <span id="status-filetype">
          {filetypeFor(activeTab?.filename ?? "Untitled")}
        </span>
      </div>
    </div>
  );
}
