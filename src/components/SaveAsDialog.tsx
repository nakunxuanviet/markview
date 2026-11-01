import { useEffect, useState } from "react";

import { pickSavePath } from "../api";
import { useStore } from "../store";
import type { LineEnding } from "../types";
import { basename } from "../utils";
import { SelectMenu } from "./SelectMenu";

const ENCODINGS = [
  { label: "UTF-8", value: "UTF-8" },
  { label: "UTF-8 with BOM", value: "UTF-8 BOM" },
  { label: "UTF-16 LE", value: "UTF-16 LE" },
  { label: "UTF-16 BE", value: "UTF-16 BE" },
  { label: "Windows-1252", value: "Windows-1252" },
  { label: "Shift_JIS", value: "Shift_JIS" },
];

const LINE_ENDINGS: { value: LineEnding; label: string; hint: string }[] = [
  { value: "lf", label: "LF", hint: "\\n" },
  { value: "crlf", label: "CRLF", hint: "\\r\\n" },
  { value: "cr", label: "CR", hint: "\\r" },
];

export function SaveAsDialog() {
  const pending = useStore((state) => state.saveAs);
  const [encoding, setEncoding] = useState("UTF-8");
  const [bom, setBom] = useState(false);
  const [lineEnding, setLineEnding] = useState<LineEnding>("lf");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pending) return;
    setEncoding(pending.encoding || "UTF-8");
    setBom(pending.bom);
    setLineEnding(pending.lineEnding);
    setBusy(false);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        useStore.getState().cancelSaveAs();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending]);

  if (!pending) return null;

  const choosePath = async () => {
    const path = await pickSavePath(pending.filename);
    if (!path) return;
    useStore.setState((state) => ({
      saveAs: state.saveAs
        ? {
            ...state.saveAs,
            path,
            filename: basename(path),
          }
        : null,
    }));
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await useStore.getState().confirmSaveAs({
      encoding,
      bom,
      lineEnding,
    });
    if (!ok) setBusy(false);
  };

  const normalizedEncoding = ENCODINGS.some((item) => item.value === encoding)
    ? encoding
    : "UTF-8";

  return (
    <div
      className="mv-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Save As"
    >
      <div className="save-as-card">
        <div className="save-as-head">
          <div>
            <h2>Save As</h2>
            <p>Choose the file format before writing to disk.</p>
          </div>
          <button
            type="button"
            className="save-as-close"
            title="Cancel"
            onClick={() => useStore.getState().cancelSaveAs()}
          >
            ×
          </button>
        </div>

        <div className="save-as-body">
          <div className="save-as-field">
            <label>File</label>
            <div className="save-as-path">
              <span className="mono" title={pending.path}>
                {pending.path}
              </span>
              <button
                type="button"
                className="mv-btn"
                onClick={() => void choosePath()}
              >
                Browse…
              </button>
            </div>
          </div>

          <div className="save-as-grid">
            <div className="save-as-field">
              <label>Encoding</label>
              <SelectMenu
                ariaLabel="Save encoding"
                value={normalizedEncoding}
                options={ENCODINGS}
                onChange={(value) => {
                  setEncoding(value);
                  setBom(value === "UTF-8 BOM" || value.startsWith("UTF-16"));
                }}
              />
            </div>
            <div className="save-as-field">
              <label>Line endings</label>
              <div className="save-as-eol">
                {LINE_ENDINGS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={lineEnding === item.value ? "on" : ""}
                    title={item.hint}
                    onClick={() => setLineEnding(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="save-as-bom">
            <input
              type="checkbox"
              checked={bom}
              onChange={(event) => setBom(event.target.checked)}
            />
            <span>
              <b>Write byte-order mark</b>
              <small>
                Only applies to UTF-8/UTF-16. Enabled automatically when the
                encoding requires it.
              </small>
            </span>
          </label>

          <p className="save-as-hint">
            The file is written atomically. Characters that cannot be
            represented in the chosen encoding will block the save.
          </p>
        </div>

        <div className="save-as-foot">
          <button
            type="button"
            className="mv-btn"
            onClick={() => useStore.getState().cancelSaveAs()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="mv-btn primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
