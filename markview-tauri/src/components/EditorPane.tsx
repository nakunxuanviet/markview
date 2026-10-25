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
import { FindBar } from "./FindBar";
import { FormatBar } from "./FormatBar";
import { editorRef } from "../editorRef";
import { snippetSource } from "../snippets";
import { registerEditorScroller } from "../scrollSync";
import { useStore } from "../store";
import { toast } from "../toast";
import { countWords } from "../utils";

export function EditorPane() {
  const hostRef = useRef<HTMLDivElement>(null);
  const silent = useRef(false);

  const themeCompartment = useRef(new Compartment());
  const lineNumberCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());
  const tabSizeCompartment = useRef(new Compartment());
  const bracketCompartment = useRef(new Compartment());

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

  const publishStatus = useCallback((view: EditorView) => {
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const content = view.state.doc.toString();
    window.dispatchEvent(
      new CustomEvent("markview:status", {
        detail: {
          line: line.number,
          col: head - line.from + 1,
          words: countWords(content),
          chars: content.length,
          bytes: new Blob([content]).size,
        },
      }),
    );
  }, []);

  // Create the editor once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const bootSettings = useStore.getState();
    const state = EditorState.create({
      doc: "",
      extensions: [
        themeCompartment.current.of(htmlToEditorTheme(bootSettings.theme)),
        lineNumberCompartment.current.of(lineNumbers()),
        wrapCompartment.current.of(EditorView.lineWrapping),
        tabSizeCompartment.current.of(
          EditorState.tabSize.of(bootSettings.settings.editor.tab_size || 4),
        ),
        bracketCompartment.current.of(bracketMatching()),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        indentUnit.of(" ".repeat(bootSettings.settings.editor.tab_size || 4)),
        highlightActiveLine(),
        highlightSelectionMatches(),
        closeBrackets(),
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
          if (update.docChanged && !silent.current) {
            const id = useStore.getState().activeId;
            if (id) {
              useStore.getState().markModified(id);
              editorBus.emit(id, update.state.doc.toString());
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

    const view = new EditorView({ state, parent: host });
    editorRef.view = view;
    registerEditorScroller(view.scrollDOM);

    editorRef.setDoc = (content: string) => {
      silent.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
      silent.current = false;
      publishStatus(view);
    };

    editorRef.restore = (cursor: number, scrollTop: number) => {
      silent.current = true;
      const max = view.state.doc.length;
      const anchor = Math.max(0, Math.min(cursor, max));
      view.dispatch({ selection: { anchor } });
      silent.current = false;
      view.scrollDOM.scrollTop = scrollTop;
    };

    editorRef.getCursor = () => view.state.selection.main.head;
    editorRef.getScroll = () => view.scrollDOM.scrollTop;
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
      editorRef.setDoc?.(initial.content);
      editorRef.restore?.(initial.cursorPos, initial.scrollTop);
      useStore.setState({ editorTabId: initial.id });
    }
    view.focus();

    return () => {
      registerEditorScroller(null);
      editorRef.view = null;
      editorRef.setDoc = undefined;
      useStore.setState({ editorTabId: null });
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load tab content when the active tab changes.
  useEffect(() => {
    const view = editorRef.view;
    if (!view) return;
    const state = useStore.getState();
    const tab = state.activeId ? state.tabs[state.activeId] : null;
    silent.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: tab?.content ?? "",
      },
      selection: {
        anchor: Math.min(tab?.cursorPos ?? 0, tab?.content.length ?? 0),
      },
    });
    silent.current = false;
    view.scrollDOM.scrollTop = tab?.scrollTop ?? 0;
    useStore.setState({ editorTabId: tab?.id ?? null });
    if (tab) view.focus();
    publishStatus(view);
  }, [activeId, publishStatus]);

  // React to appearance / editor settings.
  useEffect(() => {
    const view = editorRef.view;
    if (!view) return;
    view.dispatch({
      effects: [
        themeCompartment.current.reconfigure(
          theme === "dark" ? darkTheme : lightTheme,
        ),
        lineNumberCompartment.current.reconfigure(
          showLineNumbers ? lineNumbers() : [],
        ),
        wrapCompartment.current.reconfigure(
          wordWrap ? EditorView.lineWrapping : [],
        ),
        tabSizeCompartment.current.reconfigure(
          EditorState.tabSize.of(tabSize || 4),
        ),
        bracketCompartment.current.reconfigure(
          matchBrackets ? bracketMatching() : [],
        ),
      ],
    });
  }, [theme, showLineNumbers, wordWrap, tabSize, matchBrackets]);

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
      <FindBar />
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
