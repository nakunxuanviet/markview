import { useEffect, useState } from "react";

import { api, pickSavePath } from "../api";
import { buildExportHtml, printHtml } from "../export/html";
import { useStore } from "../store";
import { toast } from "../toast";

export function ExportDialog() {
  const open = useStore((state) => state.exportOpen);
  const currentTheme = useStore((state) => state.theme);
  const activeTab = useStore((state) =>
    state.activeId ? (state.tabs[state.activeId] ?? null) : null,
  );
  const [theme, setTheme] = useState<"dark" | "light">(currentTheme);
  const [includeToc, setIncludeToc] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTheme(currentTheme);
    setBusy(false);
  }, [open, currentTheme]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") useStore.setState({ exportOpen: false });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open) return null;

  const close = () => {
    if (busy) return;
    useStore.setState({ exportOpen: false });
  };

  const filename = `${(activeTab?.filename ?? "markdown").replace(/\.[^.]+$/, "")}.html`;

  const exportHtml = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const html = await buildExportHtml({ theme, includeToc });
      const path = await pickSavePath(filename);
      if (!path) return;
      const result = await api.saveFileAs(
        path,
        html,
        "UTF-8",
        false,
        "lf",
        false,
      );
      if (!result?.success) {
        toast.show(result?.message ?? result?.error ?? "Export failed", {
          type: "error",
        });
        return;
      }
      void useStore.getState().refreshTree();
      toast.show(`Exported ${filename}`, {
        type: "success",
        duration: 2500,
      });
      useStore.setState({ exportOpen: false });
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Export failed", {
        type: "error",
        duration: 5000,
      });
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const html = await buildExportHtml({ theme, includeToc });
      await printHtml(html);
      toast.show("Print dialog opened", { type: "info", duration: 2500 });
      useStore.setState({ exportOpen: false });
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Print failed", {
        type: "error",
        duration: 5000,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mv-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Export"
    >
      <div className="save-as-card">
        <div className="save-as-head">
          <div>
            <h2>Export</h2>
            <p>
              Export <b>{activeTab?.filename ?? "document"}</b> for sharing or
              printing.
            </p>
          </div>
          <button
            type="button"
            className="save-as-close"
            title="Close"
            onClick={close}
          >
            ×
          </button>
        </div>

        <div className="save-as-body">
          <div className="save-as-field">
            <label>Appearance</label>
            <div className="save-as-eol">
              <button
                type="button"
                className={theme === "light" ? "on" : ""}
                onClick={() => setTheme("light")}
              >
                Editorial (light)
              </button>
              <button
                type="button"
                className={theme === "dark" ? "on" : ""}
                onClick={() => setTheme("dark")}
              >
                Aurora (dark)
              </button>
            </div>
          </div>

          <label className="save-as-bom">
            <input
              type="checkbox"
              checked={includeToc}
              onChange={(event) => setIncludeToc(event.target.checked)}
            />
            <span>
              <b>Table of contents</b>
              <small>
                Add links to H1–H3 headings at the top of the export.
              </small>
            </span>
          </label>

          <p className="save-as-hint">
            HTML is a single self-contained file: local images are embedded,
            KaTeX is exported as MathML and Mermaid diagrams are kept as inline
            SVG. Print / PDF uses the Windows print dialog.
          </p>
        </div>

        <div className="save-as-foot">
          <button type="button" className="mv-btn" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="mv-btn"
            disabled={busy}
            onClick={() => void print()}
          >
            Print / PDF
          </button>
          <button
            type="button"
            className="mv-btn primary"
            disabled={busy}
            onClick={() => void exportHtml()}
          >
            {busy ? "Preparing…" : "Export HTML"}
          </button>
        </div>
      </div>
    </div>
  );
}
