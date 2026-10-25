import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";

import { editorBus } from "../editorBus";
import { editorRef } from "../editorRef";
import { IconArrowDown, IconArrowUp, IconChevronRight, IconX } from "../icons";
import { useStore } from "../store";

interface Match {
  from: number;
  to: number;
}

const MAX_MATCHES = 10000;
const HIGHLIGHT_ALL = "markview-find";
const HIGHLIGHT_ACTIVE = "markview-find-active";

interface HighlightRegistryLike {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => boolean;
}

type HighlightCtor = new (...ranges: Range[]) => unknown;

/** CSS Custom Highlight API, available in Chromium 105+ (WebView2). */
function highlightSupport(): {
  registry: HighlightRegistryLike;
  ctor: HighlightCtor;
} | null {
  const registry = (
    globalThis.CSS as unknown as { highlights?: HighlightRegistryLike }
  )?.highlights;
  const ctor = (globalThis as unknown as { Highlight?: HighlightCtor })
    .Highlight;
  return registry && ctor ? { registry, ctor } : null;
}

export function FindBar() {
  const open = useStore((state) => state.findOpen);
  const readMode = useStore(
    (state) => state.viewMode === "single" && state.singleView === "preview",
  );
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [status, setStatus] = useState("");

  const matches = useRef<Match[]>([]);
  const previewMatches = useRef<Range[]>([]);
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

  const clearPreviewMatches = useCallback(() => {
    previewMatches.current = [];
    const support = highlightSupport();
    support?.registry.delete(HIGHLIGHT_ALL);
    support?.registry.delete(HIGHLIGHT_ACTIVE);
  }, []);

  const paintPreviewMatches = useCallback((activeIndex: number) => {
    const support = highlightSupport();
    if (!support) return;
    const ranges = previewMatches.current;
    if (!ranges.length) {
      support.registry.delete(HIGHLIGHT_ALL);
      support.registry.delete(HIGHLIGHT_ACTIVE);
      return;
    }
    support.registry.set(HIGHLIGHT_ALL, new support.ctor(...ranges));
    const active = ranges[activeIndex];
    if (active) {
      support.registry.set(HIGHLIGHT_ACTIVE, new support.ctor(active));
    } else {
      support.registry.delete(HIGHLIGHT_ACTIVE);
    }
  }, []);

  /** Finds `query` in the rendered preview text, not in the markdown source. */
  const runPreviewSearch = useCallback(
    (keepIndex = false) => {
      const root = document.getElementById("preview-content");
      const regex = buildRegex();
      if (!root || !regex) {
        clearPreviewMatches();
        setStatus(query && !regex ? "Invalid regex" : "");
        return;
      }

      const ranges: Range[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || !node.nodeValue) return NodeFilter.FILTER_REJECT;
          if (parent.closest("script, style")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue ?? "";
        regex.lastIndex = 0;
        let found: RegExpExecArray | null;
        while ((found = regex.exec(text)) !== null) {
          if (found[0].length === 0) {
            regex.lastIndex += 1;
            continue;
          }
          const range = document.createRange();
          range.setStart(node, found.index);
          range.setEnd(node, found.index + found[0].length);
          ranges.push(range);
          if (ranges.length >= MAX_MATCHES) break;
        }
        if (ranges.length >= MAX_MATCHES) break;
      }

      previewMatches.current = ranges;
      if (!keepIndex || current.current >= ranges.length) {
        current.current = ranges.length ? 0 : -1;
      }
      setStatus(
        ranges.length
          ? `${Math.max(current.current, 0) + 1} of ${ranges.length}`
          : "No results",
      );
      paintPreviewMatches(current.current);
      if (ranges.length && current.current >= 0) {
        scrollPreviewTo(ranges[current.current]);
      }
    },
    [buildRegex, clearPreviewMatches, paintPreviewMatches, query],
  );

  const runSearch = useCallback(
    (keepIndex = false) => {
      if (readMode) {
        runPreviewSearch(keepIndex);
        return;
      }

      clearPreviewMatches();
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
      setStatus(
        found.length
          ? `${Math.max(current.current, 0) + 1} of ${found.length}`
          : "No results",
      );
      if (found.length && current.current >= 0) {
        const target = found[current.current];
        view.dispatch({
          selection: { anchor: target.from, head: target.to },
          effects: EditorView.scrollIntoView(target.from, { y: "center" }),
        });
      }
    },
    [buildRegex, clearPreviewMatches, query, readMode, runPreviewSearch],
  );

  const goto = useCallback(
    (index: number) => {
      if (readMode) {
        const list = previewMatches.current;
        if (!list.length) return;
        const next = ((index % list.length) + list.length) % list.length;
        current.current = next;
        paintPreviewMatches(next);
        scrollPreviewTo(list[next]);
        setStatus(`${next + 1} of ${list.length}`);
        return;
      }

      const list = matches.current;
      if (!list.length || !editorRef.view) return;
      const next = ((index % list.length) + list.length) % list.length;
      current.current = next;
      const target = list[next];
      editorRef.view.dispatch({
        selection: { anchor: target.from, head: target.to },
        effects: EditorView.scrollIntoView(target.from, { y: "center" }),
      });
      setStatus(`${next + 1} of ${list.length}`);
    },
    [paintPreviewMatches, readMode],
  );

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
  }, [open, query, caseSensitive, useRegex, wholeWord, readMode]);

  // Keep editor matches in sync with the document.
  useEffect(() => {
    if (!open || readMode) return;
    let timer: number | undefined;
    const unsubscribe = editorBus.on(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => runSearch(true), 250);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      unsubscribe();
    };
  }, [open, readMode, runSearch]);

  // Re-run the preview search when the rendered markup changes (typing,
  // theme switch, Mermaid/math post-processing).
  useEffect(() => {
    if (!open || !readMode) return;
    const panel = document.getElementById("preview-panel");
    if (!panel) return;
    let timer: number | undefined;
    const observer = new MutationObserver(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => runSearch(true), 180);
    });
    observer.observe(panel, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [open, readMode, runSearch]);

  // Drop preview highlights when the bar closes or the component unmounts.
  useEffect(() => {
    if (!open) clearPreviewMatches();
  }, [open, clearPreviewMatches]);

  useEffect(() => clearPreviewMatches, [clearPreviewMatches]);

  if (!open) return null;

  return (
    <div id="find-bar">
      <div className="find-row">
        <div className="find-input-wrap">
          <input
            ref={inputRef}
            type="text"
            id="find-input"
            placeholder="Find"
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
          <div className="find-toggles">
            <button
              id="find-case"
              type="button"
              className={`find-toggle${caseSensitive ? " on" : ""}`}
              title="Match Case"
              aria-pressed={caseSensitive}
              onClick={() => setCaseSensitive(!caseSensitive)}
            >
              Aa
            </button>
            <button
              id="find-word"
              type="button"
              className={`find-toggle${wholeWord ? " on" : ""}`}
              title="Match Whole Word"
              aria-pressed={wholeWord}
              onClick={() => setWholeWord(!wholeWord)}
            >
              ab
            </button>
            <button
              id="find-regex"
              type="button"
              className={`find-toggle${useRegex ? " on" : ""}`}
              title="Use Regular Expression"
              aria-pressed={useRegex}
              onClick={() => setUseRegex(!useRegex)}
            >
              .*
            </button>
          </div>
        </div>
        <span id="find-count">{status}</span>
        <button
          id="find-prev"
          className="find-icon"
          title="Previous Match (Shift+Enter)"
          onClick={() => goto(current.current - 1)}
        >
          <IconArrowUp />
        </button>
        <button
          id="find-next"
          className="find-icon"
          title="Next Match (Enter)"
          onClick={() => goto(current.current + 1)}
        >
          <IconArrowDown />
        </button>
        {!readMode && (
          <button
            id="find-toggle-replace"
            className={`find-icon find-chevron${replaceMode ? " on" : ""}`}
            title={replaceMode ? "Hide Replace" : "Toggle Replace"}
            aria-pressed={replaceMode}
            onClick={() => setReplaceMode(!replaceMode)}
          >
            <IconChevronRight />
          </button>
        )}
        <button
          id="find-close"
          className="find-icon"
          title="Close (Esc)"
          onClick={() => useStore.setState({ findOpen: false })}
        >
          <IconX />
        </button>
      </div>
      {replaceMode && !readMode && (
        <div className="find-row" id="replace-row">
          <div className="find-input-wrap">
            <input
              type="text"
              id="replace-input"
              placeholder="Replace"
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
          </div>
          <button
            id="replace-one"
            className="find-action"
            title="Replace"
            onClick={replaceOne}
          >
            Replace
          </button>
          <button
            id="replace-all"
            className="find-action"
            title="Replace All"
            onClick={replaceAll}
          >
            All
          </button>
        </div>
      )}
    </div>
  );
}

/** Scrolls the preview pane just enough to reveal a match. */
function scrollPreviewTo(range: Range) {
  const panel = document.getElementById("preview-panel");
  if (!panel) return;
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const box = panel.getBoundingClientRect();
  const topInset = 56; // pane bar plus a little breathing room
  if (rect.top >= box.top + topInset && rect.bottom <= box.bottom - 24) return;
  const target = panel.scrollTop + (rect.top - box.top) - box.height / 3;
  panel.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
