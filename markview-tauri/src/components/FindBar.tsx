import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";

import { editorBus } from "../editorBus";
import { editorRef } from "../editorRef";
import { IconArrowDown, IconArrowUp, IconSwap, IconX } from "../icons";
import { useStore } from "../store";

interface Match {
  from: number;
  to: number;
}

const MAX_MATCHES = 10000;

export function FindBar() {
  const open = useStore((state) => state.findOpen);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [status, setStatus] = useState("");

  const matches = useRef<Match[]>([]);
  const current = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const buildRegex = useCallback((): RegExp | null => {
    if (!query) return null;
    if (useRegex && query.length > 200) return null;
    let pattern = useRegex ? query : escapeRegExp(query);
    if (wholeWord) pattern = `\\b${pattern}\\b`;
    try {
      return new RegExp(pattern, `g${caseSensitive ? "" : "i"}`);
    } catch {
      return null;
    }
  }, [query, useRegex, wholeWord, caseSensitive]);

  const runSearch = useCallback(
    (keepIndex = false) => {
      const view = editorRef.view;
      if (!view || !query) {
        matches.current = [];
        setStatus("");
        return;
      }
      const regex = buildRegex();
      if (!regex) {
        matches.current = [];
        setStatus("Invalid regex");
        return;
      }
      const text = view.state.doc.toString();
      const found: Match[] = [];
      let match: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        if (match[0].length === 0) {
          regex.lastIndex += 1;
          continue;
        }
        found.push({ from: match.index, to: match.index + match[0].length });
        if (found.length >= MAX_MATCHES) break;
      }
      matches.current = found;
      if (!keepIndex) current.current = found.length ? 0 : -1;
      setStatus(found.length ? `${Math.max(current.current, 0) + 1}/${found.length}` : "No results");
      if (found.length && current.current >= 0) {
        const target = found[current.current];
        view.dispatch({
          selection: { anchor: target.from, head: target.to },
          effects: EditorView.scrollIntoView(target.from, { y: "center" }),
        });
      }
    },
    [buildRegex, query],
  );

  const goto = useCallback((index: number) => {
    const list = matches.current;
    if (!list.length || !editorRef.view) return;
    const next = ((index % list.length) + list.length) % list.length;
    current.current = next;
    const target = list[next];
    editorRef.view.dispatch({
      selection: { anchor: target.from, head: target.to },
      effects: EditorView.scrollIntoView(target.from, { y: "center" }),
    });
    setStatus(`${next + 1}/${list.length}`);
  }, []);

  const replaceOne = useCallback(() => {
    const view = editorRef.view;
    const target = matches.current[current.current];
    if (!view || !target) return;
    view.dispatch({
      changes: { from: target.from, to: target.to, insert: replacement },
      selection: { anchor: target.from + replacement.length },
    });
    runSearch(true);
  }, [replacement, runSearch]);

  const replaceAll = useCallback(() => {
    const view = editorRef.view;
    if (!view || matches.current.length === 0) return;
    const changes = matches.current.map((match) => ({
      from: match.from,
      to: match.to,
      insert: replacement,
    }));
    view.dispatch({ changes });
    runSearch();
  }, [replacement, runSearch]);

  // Open / close wiring from global shortcuts.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ replace: boolean }>).detail;
      setReplaceMode(!!detail?.replace);
      useStore.setState({ findOpen: true });
      setTimeout(() => inputRef.current?.focus(), 30);
    };
    window.addEventListener("markview:find", handler);
    return () => window.removeEventListener("markview:find", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (open) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, caseSensitive, useRegex, wholeWord]);

  useEffect(() => {
    if (!open) return;
    let timer: number | undefined;
    const unsubscribe = editorBus.on(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => runSearch(true), 250);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      unsubscribe();
    };
  }, [open, runSearch]);

  if (!open) return null;

  return (
    <div id="find-bar">
      <div className="find-row">
        <input
          ref={inputRef}
          type="text"
          id="find-input"
          placeholder="Find..."
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              goto(current.current + (event.shiftKey ? -1 : 1));
            } else if (event.key === "Escape") {
              event.preventDefault();
              useStore.setState({ findOpen: false });
            }
          }}
        />
        <button id="find-prev" title="Previous" onClick={() => goto(current.current - 1)}>
          <IconArrowUp />
        </button>
        <button id="find-next" title="Next" onClick={() => goto(current.current + 1)}>
          <IconArrowDown />
        </button>
        <span id="find-count">{status}</span>
        <label>
          <input
            type="checkbox"
            id="find-case"
            checked={caseSensitive}
            onChange={(event) => setCaseSensitive(event.target.checked)}
          />{" "}
          Aa
        </label>
        <label>
          <input
            type="checkbox"
            id="find-regex"
            checked={useRegex}
            onChange={(event) => setUseRegex(event.target.checked)}
          />{" "}
          .*
        </label>
        <label>
          <input
            type="checkbox"
            id="find-word"
            checked={wholeWord}
            onChange={(event) => setWholeWord(event.target.checked)}
          />{" "}
          W
        </label>
        <button
          title="Toggle replace"
          className={replaceMode ? "on" : ""}
          onClick={() => setReplaceMode(!replaceMode)}
        >
          <IconSwap />
        </button>
        <button
          id="find-close"
          title="Close"
          onClick={() => useStore.setState({ findOpen: false })}
        >
          <IconX />
        </button>
      </div>
      <div className="find-row" id="replace-row" style={{ display: replaceMode ? "flex" : "none" }}>
        <input
          type="text"
          id="replace-input"
          placeholder="Replace..."
          autoComplete="off"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              replaceOne();
            }
          }}
        />
        <button id="replace-one" title="Replace" onClick={replaceOne}>
          Replace
        </button>
        <button id="replace-all" title="Replace All" onClick={replaceAll}>
          All
        </button>
      </div>
    </div>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
