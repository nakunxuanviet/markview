import { useCallback, useEffect, useRef } from "react";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from "@codemirror/language";
import { highlightSelectionMatches } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from "@codemirror/view";

import { api } from "../api";
import { darkTheme, lightTheme } from "../cmTheme";
import { editorBus } from "../editorBus";
import { FormatBar } from "./FormatBar";
import { editorRef } from "../editorRef";
import { EDITOR_STATE_CACHE } from "../previewConfig";
import { snippetSource } from "../snippets";
import { registerEditorScroller } from "../scrollSync";
import { useStore } from "../store";
import { toast } from "../toast";
import { countWords } from "../utils";

const encoder = new TextEncoder();

export function EditorPane() {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateCache = useRef(new Map<string, EditorState>());
  const currentTabRef = useRef<string | null>(null);

  const themeCompartment = useRef(new Compartment());
  const lineNumberCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());
  const tabSizeCompartment = useRef(new Compartment());
  const bracketCompartment = useRef(new Compartment());
  const closeBracketsCompartment = useRef(new Compartment());
  const activeLineCompartment = useRef(new Compartment());
  const indentOnInputCompartment = useRef(new Compartment());
  const indentUnitCompartment = useRef(new Compartment());
  const foldGutterCompartment = useRef(new Compartment());
  const spellcheckCompartment = useRef(new Compartment());

  const statsRef = useRef({ words: 0, bytes: 0 });
  const statusFrame = useRef<number | undefined>(undefined);
  const statusTimer = useRef<number | undefined>(undefined);
  const statusView = useRef<EditorView | null>(null);

  const activeId = useStore((state) => state.activeId);
  const theme = useStore((state) => state.theme);
  const fontSize = useStore(
    (state) => state.settings.appearance.font_size_editor,
  );
  const showLineNumbers = useStore(
    (state) => state.settings.appearance.show_line_numbers,
  );
  const wordWrap = useStore((state) => state.settings.editor.word_wrap);
  const tabSize = useStore((state) => state.settings.editor.tab_size);
  const matchBrackets = useStore(
    (state) => state.settings.editor.match_brackets,
  );
  const autoCloseBrackets = useStore(
    (state) => state.settings.editor.auto_close_brackets,
  );
  const autoIndent = useStore((state) => state.settings.editor.auto_indent);
  const highlightActiveLineSetting = useStore(
    (state) => state.settings.editor.highlight_active_line,
  );
  const insertSpaces = useStore((state) => state.settings.editor.insert_spaces);
  const codeFolding = useStore((state) => state.settings.editor.code_folding);
  const spellcheck = useStore((state) => state.settings.editor.spellcheck);

  const dispatchStatus = useCallback((view: EditorView) => {
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    window.dispatchEvent(
      new CustomEvent("markview:status", {
        detail: {
          line: line.number,
          col: head - line.from + 1,
          words: statsRef.current.words,
          chars: view.state.doc.length,
          bytes: statsRef.current.bytes,
        },
      }),
    );
  }, []);

  /**
   * Position follows the caret immediately; word/byte counts are recomputed
   * 200 ms after the last change. This keeps a 1 MB document cheap per key.
   */
  const publishStatus = useCallback(
    (view: EditorView, immediate = false) => {
      statusView.current = view;
      if (statusFrame.current === undefined) {
        statusFrame.current = window.requestAnimationFrame(() => {
          statusFrame.current = undefined;
          const current = statusView.current;
          if (current) dispatchStatus(current);
        });
      }
      if (statusTimer.current !== undefined) {
        window.clearTimeout(statusTimer.current);
        statusTimer.current = undefined;
      }
      const compute = () => {
        statusTimer.current = undefined;
        const current = statusView.current;
        if (!current) return;
        const text = current.state.doc.toString();
        statsRef.current = {
          words: countWords(text),
          bytes: encoder.encode(text).length,
        };
        dispatchStatus(current);
      };
      if (immediate) compute();
      else statusTimer.current = window.setTimeout(compute, 200);
    },
    [dispatchStatus],
  );

  const createState = useCallback(
    (content: string, cursor: number) => {
      const settings = useStore.getState();
      const tabSizeValue = settings.settings.editor.tab_size || 4;
      return EditorState.create({
        doc: content,
        selection: {
          anchor: Math.max(0, Math.min(cursor, content.length)),
        },
        extensions: [
          themeCompartment.current.of(htmlToEditorTheme(settings.theme)),
          lineNumberCompartment.current.of(
            settings.settings.appearance.show_line_numbers !== false
              ? lineNumbers()
              : [],
          ),
          wrapCompartment.current.of(
            settings.settings.editor.word_wrap ? EditorView.lineWrapping : [],
          ),
          tabSizeCompartment.current.of(EditorState.tabSize.of(tabSizeValue)),
          bracketCompartment.current.of(
            settings.settings.editor.match_brackets ? bracketMatching() : [],
          ),
          closeBracketsCompartment.current.of(
            settings.settings.editor.auto_close_brackets ? closeBrackets() : [],
          ),
          activeLineCompartment.current.of(
            settings.settings.editor.highlight_active_line
              ? [highlightActiveLine(), highlightActiveLineGutter()]
              : [],
          ),
          indentOnInputCompartment.current.of(
            settings.settings.editor.auto_indent ? indentOnInput() : [],
          ),
          indentUnitCompartment.current.of(
            indentUnit.of(
              settings.settings.editor.insert_spaces
                ? " ".repeat(tabSizeValue)
                : "\t",
            ),
          ),
          foldGutterCompartment.current.of(
            settings.settings.editor.code_folding ? foldGutter() : [],
          ),
          spellcheckCompartment.current.of(
            settings.settings.editor.spellcheck
              ? EditorView.contentAttributes.of({ spellcheck: "true" })
              : [],
          ),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          highlightSelectionMatches(),
          autocompletion({
            override: [snippetSource],
            activateOnTyping: true,
            icons: false,
          }),
          markdown({ base: markdownLanguage, addKeymap: true }),
          placeholder("Start writing markdown..."),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const id = useStore.getState().activeId;
              if (id) {
                useStore.getState().markModified(id);
                editorBus.emit(id, update.state.doc);
              }
            }
            if (update.docChanged || update.selectionSet) {
              publishStatus(update.view);
            }
          }),
          EditorView.domEventHandlers({
            paste: (event) => {
              if (!hasClipboardImage(event)) return false;
              event.preventDefault();
              void handleImagePaste(event);
              return true;
            },
          }),
        ],
      });
    },
    [publishStatus],
  );

  const applyCompartments = useCallback((view: EditorView) => {
    const state = useStore.getState();
    view.dispatch({
      effects: [
        themeCompartment.current.reconfigure(htmlToEditorTheme(state.theme)),
        lineNumberCompartment.current.reconfigure(
          state.settings.appearance.show_line_numbers !== false
            ? lineNumbers()
            : [],
        ),
        wrapCompartment.current.reconfigure(
          state.settings.editor.word_wrap ? EditorView.lineWrapping : [],
        ),
        tabSizeCompartment.current.reconfigure(
          EditorState.tabSize.of(state.settings.editor.tab_size || 4),
        ),
        bracketCompartment.current.reconfigure(
          state.settings.editor.match_brackets ? bracketMatching() : [],
        ),
        closeBracketsCompartment.current.reconfigure(
          state.settings.editor.auto_close_brackets ? closeBrackets() : [],
        ),
        activeLineCompartment.current.reconfigure(
          state.settings.editor.highlight_active_line
            ? [highlightActiveLine(), highlightActiveLineGutter()]
            : [],
        ),
        indentOnInputCompartment.current.reconfigure(
          state.settings.editor.auto_indent ? indentOnInput() : [],
        ),
        indentUnitCompartment.current.reconfigure(
          indentUnit.of(
            state.settings.editor.insert_spaces
              ? " ".repeat(state.settings.editor.tab_size || 4)
              : "\t",
          ),
        ),
        foldGutterCompartment.current.reconfigure(
          state.settings.editor.code_folding ? foldGutter() : [],
        ),
        spellcheckCompartment.current.reconfigure(
          state.settings.editor.spellcheck
            ? EditorView.contentAttributes.of({ spellcheck: "true" })
            : [],
        ),
      ],
    });
  }, []);

  const rememberState = useCallback((id: string, state: EditorState) => {
    const cache = stateCache.current;
    cache.delete(id);
    if (state.doc.length * 2 <= EDITOR_STATE_CACHE.maxDocumentBytes) {
      cache.set(id, state);
    }
    let total = 0;
    for (const cached of cache.values()) total += cached.doc.length * 2;
    while (
      cache.size > EDITOR_STATE_CACHE.maxStates ||
      (total > EDITOR_STATE_CACHE.maxBytes && cache.size > 1)
    ) {
      const victim = [...cache.keys()].find(
        (key) => key !== currentTabRef.current && key !== id,
      );
      if (!victim) break;
      total -= (cache.get(victim)?.doc.length ?? 0) * 2;
      cache.delete(victim);
    }
  }, []);

  const pruneCache = useCallback((order: string[]) => {
    const live = new Set(order);
    for (const id of [...stateCache.current.keys()]) {
      if (!live.has(id)) stateCache.current.delete(id);
    }
  }, []);

  // Create the editor once. Per-tab EditorState objects keep history isolated.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const empty = createState("", 0);
    const view = new EditorView({ state: empty, parent: host });
    editorRef.view = view;
    registerEditorScroller(view.scrollDOM);

    editorRef.setDoc = (content: string) => {
      const store = useStore.getState();
      const id = store.activeId;
      if (!id || currentTabRef.current !== id) return;
      const cursor = Math.min(view.state.selection.main.head, content.length);
      const next = createState(content, cursor);
      rememberState(id, next);
      currentTabRef.current = id;
      view.setState(next);
      useStore.setState({ editorTabId: id });
      publishStatus(view, true);
    };

    editorRef.focus = () => view.focus();
    editorRef.scrollToLine = (line: number) => {
      const docLine = view.state.doc.line(
        Math.max(1, Math.min(line, view.state.doc.lines)),
      );
      view.dispatch({
        selection: { anchor: docLine.from },
        effects: EditorView.scrollIntoView(docLine.from, { y: "center" }),
      });
      view.focus();
    };
    editorRef.insertText = (text: string) => {
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
      view.focus();
    };

    const store = useStore.getState();
    const initial = store.activeId ? store.tabs[store.activeId] : null;
    if (initial) {
      const state = createState(initial.content, initial.cursorPos);
      rememberState(initial.id, state);
      currentTabRef.current = initial.id;
      view.setState(state);
      view.scrollDOM.scrollTop = initial.scrollTop;
      useStore.setState({ editorTabId: initial.id });
    }
    publishStatus(view, true);
    view.focus();

    return () => {
      if (statusFrame.current !== undefined) {
        window.cancelAnimationFrame(statusFrame.current);
        statusFrame.current = undefined;
      }
      if (statusTimer.current !== undefined) {
        window.clearTimeout(statusTimer.current);
        statusTimer.current = undefined;
      }
      registerEditorScroller(null);
      editorRef.view = null;
      editorRef.setDoc = undefined;
      editorRef.focus = undefined;
      editorRef.scrollToLine = undefined;
      editorRef.insertText = undefined;
      currentTabRef.current = null;
      stateCache.current.clear();
      useStore.setState({ editorTabId: null });
      view.destroy();
    };
  }, [createState, publishStatus, rememberState]);

  // Load the active tab's cached state (or create it) when tabs change.
  useEffect(() => {
    const view = editorRef.view;
    if (!view) return;
    const store = useStore.getState();

    const id = store.activeId;
    if (!id) {
      pruneCache(store.order);
      if (currentTabRef.current !== null) {
        currentTabRef.current = null;
        view.setState(createState("", 0));
        useStore.setState({ editorTabId: null });
        publishStatus(view, true);
      }
      return;
    }

    const tab = store.tabs[id];
    if (!tab) return;

    // The view already holds this tab. This happens when only `active`
    // changes (WRITE ↔ SPLIT) or when settings reconfigured the state; the
    // live state is authoritative, so never rebuild it from a stale snapshot.
    if (currentTabRef.current === id) {
      if (stateCache.current.get(id) !== view.state) {
        rememberState(id, view.state);
      }
      return;
    }

    const cached = stateCache.current.get(id);
    const previous = currentTabRef.current;
    if (previous && previous !== id) {
      rememberState(previous, view.state);
    }
    pruneCache(store.order);

    // A tab changed on disk (or was reloaded) while inactive: drop its stale
    // history-backed state and rebuild from the store.
    const usable =
      cached &&
      cached.doc.length === tab.content.length &&
      cached.doc.toString() === tab.content
        ? cached
        : undefined;
    const next = usable ?? createState(tab.content, tab.cursorPos);
    currentTabRef.current = id;
    rememberState(id, next);
    view.setState(next);
    applyCompartments(view);
    // Reconfiguration creates a fresh EditorState; keep the cache pointing at
    // the live state so a later WRITE ↔ SPLIT toggle does not restore stale text.
    rememberState(id, view.state);
    view.scrollDOM.scrollTop = tab.scrollTop;
    useStore.setState({ editorTabId: id });
    publishStatus(view, true);
    view.focus();
  }, [
    activeId,
    applyCompartments,
    createState,
    pruneCache,
    publishStatus,
    rememberState,
  ]);

  // React to appearance / editor settings.
  useEffect(() => {
    const view = editorRef.view;
    if (!view) return;
    applyCompartments(view);
    const current = currentTabRef.current;
    if (current) rememberState(current, view.state);
  }, [
    theme,
    showLineNumbers,
    wordWrap,
    tabSize,
    matchBrackets,
    autoCloseBrackets,
    autoIndent,
    highlightActiveLineSetting,
    insertSpaces,
    codeFolding,
    spellcheck,
    applyCompartments,
    rememberState,
  ]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-size-editor",
      `${fontSize}px`,
    );
  }, [fontSize]);

  return (
    <div id="editor-panel">
      <FormatBar />
      <div id="cm-editor" ref={hostRef} />
    </div>
  );
}

function htmlToEditorTheme(theme: string) {
  return theme === "dark" ? darkTheme : lightTheme;
}

function hasClipboardImage(event: ClipboardEvent): boolean {
  const items = event.clipboardData?.items;
  if (!items) return false;
  for (const item of items) {
    if (item.type.startsWith("image/")) return true;
  }
  return false;
}

/**
 * Paste an image from the clipboard into `<file dir>/assets/` and insert a
 * markdown reference at the cursor.
 */
async function handleImagePaste(event: ClipboardEvent): Promise<void> {
  const items = event.clipboardData?.items;
  if (!items) return;
  let imageFile: File | null = null;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      imageFile = item.getAsFile();
      break;
    }
  }
  if (!imageFile) return;

  const state = useStore.getState();
  const tab = state.activeId ? state.tabs[state.activeId] : null;
  if (!tab?.path) {
    toast.show("Save the file first before pasting images.", { type: "warn" });
    return;
  }

  const ext = (imageFile.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const filename = `image-${Date.now()}.${ext}`;
  const base64 = await fileToBase64(imageFile);
  const folder = `${tab.path.replace(/\\/g, "/").replace(/\/[^/]*$/, "")}/assets`;

  try {
    const result = await api.saveImage(folder, filename, base64);
    if (result?.error) {
      toast.show(result.error, { type: "error" });
      return;
    }
    const current = useStore.getState();
    if (
      current.activeId !== tab.id ||
      current.tabs[tab.id]?.path !== tab.path
    ) {
      toast.show("Image saved, but the active tab changed before insertion.", {
        type: "warn",
      });
      return;
    }
    editorRef.insertText?.(`![${filename}](assets/${filename})`);
  } catch (error) {
    toast.show(`Image paste failed: ${String(error)}`, { type: "error" });
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
