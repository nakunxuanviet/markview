import { useEffect, useRef, useState } from "react";

import { api } from "../api";
import { IconSearch } from "../icons";
import { useStore } from "../store";
import type { FileHit } from "../types";
import { relativeTo } from "../utils";

export function QuickOpen() {
  const open = useStore((state) => state.quickOpenOpen);
  const workspace = useStore((state) => state.workspace);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileHit[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelected(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (timer.current) window.clearTimeout(timer.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const hits = await api.searchFilenames(query.trim());
        setResults(hits ?? []);
        setSelected(0);
      } catch {
        setResults([]);
      }
    }, 120);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query, open]);

  if (!open) return null;

  const choose = (hit: FileHit | undefined) => {
    if (!hit) return;
    useStore.setState({ quickOpenOpen: false });
    void useStore.getState().openPath(hit.path, false);
    useStore.getState().revealActiveInTree(hit.path);
  };

  const close = () => useStore.setState({ quickOpenOpen: false });

  return (
    <div id="quick-open">
      <div className="quick-open-overlay" onClick={close} />
      <div className="quick-open-dialog">
        <div className="dialog-search">
          <IconSearch />
          <input
            ref={inputRef}
            type="text"
            id="quick-open-input"
            placeholder="Search files by name"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((index) => Math.min(index + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(results[selected]);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div id="quick-open-list">
          {results.map((hit, index) => (
            <div
              key={hit.path}
              className={`quick-open-item${index === selected ? " selected" : ""}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => choose(hit)}
            >
              <span className="qo-name">{hit.name}</span>
              <span className="qo-path">{relativeTo(workspace ?? "", hit.path)}</span>
            </div>
          ))}
          {query.trim() && results.length === 0 && (
            <div className="sif-empty">No matching files</div>
          )}
        </div>
        <div className="dialog-hint">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
        </div>
      </div>
    </div>
  );
}
