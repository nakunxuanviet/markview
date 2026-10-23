import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../api";
import { editorRef } from "../editorRef";
import { IconSearch, IconX } from "../icons";
import { useStore } from "../store";
import type { SearchHit } from "../types";

interface GroupedResults {
  file: string;
  filename: string;
  hits: SearchHit[];
}

export function SearchInFiles() {
  const open = useStore((state) => state.searchFilesOpen);
  const workspace = useStore((state) => state.workspace);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (timer.current) window.clearTimeout(timer.current);
    if (!query.trim() || !workspace) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await api.searchInFiles(query, null, {
          case_sensitive: caseSensitive,
          whole_word: wholeWord,
          regex: useRegex,
          include,
          exclude,
        });
        setResults(hits ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query, caseSensitive, wholeWord, useRegex, include, exclude, workspace, open]);

  const groups = useMemo<GroupedResults[]>(() => {
    const map = new Map<string, GroupedResults>();
    for (const hit of results) {
      const existing = map.get(hit.file);
      if (existing) {
        existing.hits.push(hit);
      } else {
        map.set(hit.file, { file: hit.file, filename: hit.filename, hits: [hit] });
      }
    }
    return [...map.values()];
  }, [results]);

  if (!open) return null;

  const close = () => useStore.setState({ searchFilesOpen: false });

  const openHit = async (hit: SearchHit) => {
    const store = useStore.getState();
    await store.openPath(hit.file, false);
    window.setTimeout(() => editorRef.scrollToLine?.(hit.line), 120);
  };

  return (
    <div id="search-in-files">
      <div className="sif-header">
        <IconSearch />
        <input
          ref={inputRef}
          type="text"
          id="sif-input"
          placeholder="Search in all files"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        />
        <button id="sif-close" title="Close" onClick={close}>
          <IconX />
        </button>
      </div>
      <div className="sif-options">
        <label>
          <input
            type="checkbox"
            id="sif-case"
            checked={caseSensitive}
            onChange={(event) => setCaseSensitive(event.target.checked)}
          />{" "}
          Match Case
        </label>
        <label>
          <input
            type="checkbox"
            id="sif-word"
            checked={wholeWord}
            onChange={(event) => setWholeWord(event.target.checked)}
          />{" "}
          Match Whole Word
        </label>
        <label>
          <input
            type="checkbox"
            id="sif-regex"
            checked={useRegex}
            onChange={(event) => setUseRegex(event.target.checked)}
          />{" "}
          Use Regular Expression
        </label>
        <input
          type="text"
          id="sif-include"
          placeholder="Files to include (glob, comma-separated)"
          value={include}
          onChange={(event) => setInclude(event.target.value)}
        />
        <input
          type="text"
          id="sif-exclude"
          placeholder="Files to exclude (glob, comma-separated)"
          value={exclude}
          onChange={(event) => setExclude(event.target.value)}
        />
      </div>
      <div id="sif-results">
        {searching && <div className="sif-empty">Searching…</div>}
        {!searching && query.trim() && groups.length === 0 && (
          <div className="sif-empty">No results</div>
        )}
        {groups.map((group) => (
          <div className="sif-file-group" key={group.file}>
            <div className="sif-filename">
              {group.filename} <span className="sif-count">({group.hits.length})</span>
            </div>
            {group.hits.map((hit, index) => (
              <div
                className="sif-match"
                key={`${hit.line}-${index}`}
                title={`Line ${hit.line}`}
                onClick={() => void openHit(hit)}
              >
                <span className="sif-line-num">{hit.line}</span>
                <span className="sif-text">{highlight(hit.text, query, caseSensitive, useRegex)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function highlight(
  text: string,
  query: string,
  caseSensitive: boolean,
  useRegex: boolean,
): ReactNode {
  if (!query) return text;
  let pattern: RegExp;
  try {
    pattern = useRegex
      ? new RegExp(query, caseSensitive ? "g" : "gi")
      : new RegExp(
          query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          caseSensitive ? "g" : "gi",
        );
  } catch {
    return text;
  }
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let guard = 0;
  while ((match = pattern.exec(text)) !== null && guard < 50) {
    guard += 1;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<mark key={`${match.index}-${guard}`}>{match[0]}</mark>);
    last = match.index + match[0].length;
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
  parts.push(text.slice(last));
  return parts;
}
