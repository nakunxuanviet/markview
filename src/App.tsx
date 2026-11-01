import { useEffect, useLayoutEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { api } from "./api";
import { openFind, saveActiveAs } from "./actions";
import { AppBar } from "./components/AppBar";
import { CommandPalette } from "./components/CommandPalette";
import { ContextMenu } from "./components/ContextMenu";
import { DiffDialog } from "./components/DiffDialog";
import { EditorPane } from "./components/EditorPane";
import { EmptyState } from "./components/EmptyState";
import { ExportDialog } from "./components/ExportDialog";
import { FindBar } from "./components/FindBar";
import { PreviewPane } from "./components/PreviewPane";
import { PromptDialog } from "./components/PromptDialog";
import { QuickOpen } from "./components/QuickOpen";
import { SaveAsDialog } from "./components/SaveAsDialog";
import { SearchInFiles } from "./components/SearchInFiles";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { Toaster } from "./components/Toaster";
import { applyFormat } from "./format";
import { editorBus } from "./editorBus";
import { editorRef } from "./editorRef";
import { setScrollSyncEnabled } from "./scrollSync";
import { flushSettingsPersist, persistSettings, useStore } from "./store";
import { applyAppearance, applyTheme } from "./theme";
import { toast } from "./toast";
import { dirname } from "./utils";
import type { FsEvent } from "./types";
import { checkForUpdates } from "./updater";

let bootstrapped = false;

export function App() {
  const ready = useStore((state) => state.ready);
  const settings = useStore((state) => state.settings);
  const theme = useStore((state) => state.theme);
  const viewMode = useStore((state) => state.viewMode);
  const singleView = useStore((state) => state.singleView);
  const zenMode = useStore((state) => state.zenMode);
  const dragOver = useStore((state) => state.dragOver);
  const sidebarVisible = useStore((state) => state.sidebarVisible);
  const previewVisible = useStore((state) => state.previewVisible);
  const banners = useStore((state) => state.banners);
  const openTabCount = useStore((state) => state.order.length);
  const activeTitle = useStore((state) =>
    state.activeId
      ? (state.tabs[state.activeId]?.filename ?? "MarkView")
      : "MarkView",
  );

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Boot once: settings, session restore, initial tab.
  useEffect(() => {
    if (bootstrapped) return;
    bootstrapped = true;
    void useStore
      .getState()
      .init()
      .then(() => {
        // Give the window a moment to settle before touching the network.
        window.setTimeout(() => void checkForUpdates(), 4000);
      });
  }, []);

  // Theme + typography. Layout effects so the preview's passive effect reads
  // the new CSS tokens (Mermaid reads them at render time).
  useLayoutEffect(() => {
    applyTheme(theme);
    void api.setWindowTheme(theme).catch(() => {
      /* native chrome is best-effort */
    });
  }, [theme]);

  // Windows can keep a stale non-client frame when the saved theme lands
  // while the window is still starting up. Re-apply once boot finishes and
  // whenever the window regains focus so the native title bar stays in sync.
  useEffect(() => {
    if (!ready) return;
    const syncNativeTheme = () => {
      void api.setWindowTheme(useStore.getState().theme).catch(() => {
        /* native chrome is best-effort */
      });
    };
    syncNativeTheme();
    window.addEventListener("focus", syncNativeTheme);
    return () => window.removeEventListener("focus", syncNativeTheme);
  }, [ready]);

  useLayoutEffect(() => {
    applyAppearance(settings.appearance);
    setScrollSyncEnabled(settings.preview.scroll_sync !== false);
  }, [settings.appearance, settings.preview.scroll_sync]);

  // Persisted webview zoom (opt-in from Settings).
  useEffect(() => {
    const enabled = settings.appearance.zoom_enabled === true;
    const level = enabled
      ? Math.min(2.5, Math.max(0.5, settings.appearance.zoom_level || 1))
      : 1;
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        if (!cancelled) await getCurrentWebview().setZoom(level);
      } catch (error) {
        console.warn("zoom unavailable", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.appearance.zoom_level, settings.appearance.zoom_enabled]);

  // Ctrl/Cmd + wheel zoom, persisted shortly after the last step.
  useEffect(() => {
    let saveTimer: number | undefined;
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      // Zoom is opt-in; swallow the gesture so the webview does not fall back
      // to its own zoom handling.
      if (!useStore.getState().settings.appearance.zoom_enabled) return;
      const current = useStore.getState().settings.appearance.zoom_level || 1;
      const direction = event.deltaY < 0 ? 1 : -1;
      const next =
        Math.round(
          Math.min(2.5, Math.max(0.5, current + direction * 0.1)) * 100,
        ) / 100;
      if (next === current) return;

      useStore.setState((state) => ({
        settings: {
          ...state.settings,
          appearance: { ...state.settings.appearance, zoom_level: next },
        },
      }));

      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        const level = useStore.getState().settings.appearance.zoom_level;
        void persistSettings({ appearance: { zoom_level: level } });
      }, 350);
    };

    window.addEventListener("wheel", handler, {
      capture: true,
      passive: false,
    });
    return () => {
      window.removeEventListener("wheel", handler, true);
      if (saveTimer) window.clearTimeout(saveTimer);
    };
  }, []);

  // Layout classes consumed by the original stylesheets.
  useEffect(() => {
    const body = document.body;
    body.classList.toggle("view-mode-single", viewMode === "single");
    body.classList.toggle("view-mode-split", viewMode === "split");
    body.classList.toggle(
      "single-editor",
      viewMode === "single" && singleView === "editor",
    );
    body.classList.toggle(
      "single-preview",
      viewMode === "single" && singleView === "preview",
    );
    body.classList.toggle("zen-mode", zenMode);
    body.classList.toggle("drag-over", dragOver);
  }, [viewMode, singleView, zenMode, dragOver]);

  // Window title.
  useEffect(() => {
    const title =
      activeTitle === "MarkView" ? "MarkView" : `${activeTitle} — MarkView`;
    document.title = title;
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
      .catch(() => undefined);
  }, [activeTitle]);

  // Session backup + optional auto save.
  useEffect(() => {
    if (!ready) return;
    const seconds = Math.max(
      3,
      Math.min(60, settings.session.backup_interval || 10),
    );
    const id = window.setInterval(() => {
      void useStore.getState().saveSession();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [ready, settings.session.backup_interval]);

  useEffect(() => {
    if (!ready || !settings.files.auto_save) return;
    const seconds = Math.max(5, settings.files.auto_save_interval || 30);
    const id = window.setInterval(() => {
      const state = useStore.getState();
      const tab = state.activeId ? state.tabs[state.activeId] : null;
      if (tab && tab.modified && tab.path) void state.saveTab(tab.id);
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [ready, settings.files.auto_save, settings.files.auto_save_interval]);

  // Keep the outline in sync with typing, without touching the store on every
  // keystroke.
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = editorBus.on((tabId) => {
      if (tabId !== useStore.getState().activeId) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        useStore.getState().refreshHeadings();
      }, 300);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // Save the session when the window goes away or is minimized. Best effort
  // only: the periodic backup is what guarantees durability.
  useEffect(() => {
    if (!ready) return;
    const handler = () => {
      void useStore.getState().saveSession();
      void flushSettingsPersist();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") handler();
    };
    window.addEventListener("beforeunload", handler);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready]);

  // Native close: flush the session, then let Rust finish the close. Rust
  // waits at most three seconds, so a broken webview can never block exit.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let handled = false;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const stop = await listen("app-close-requested", () => {
          if (handled) return;
          handled = true;
          void (async () => {
            try {
              const state = useStore.getState();
              if (state.ready) {
                // The second call captures edits made while the first write
                // was in flight.
                await state.saveSession();
                await useStore.getState().saveSession();
              }
            } catch (error) {
              console.error("Failed to flush session before close", error);
            } finally {
              await flushSettingsPersist().catch(() => undefined);
              await api.confirmClose().catch(() => undefined);
            }
          })();
        });
        if (disposed) stop();
        else unlisten = stop;
      } catch (error) {
        console.warn("close listener unavailable", error);
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Files outside the workspace are not covered by the recursive watcher.
  // Check their mtimes whenever the window regains focus.
  useEffect(() => {
    if (!ready) return;
    let timer: number | undefined;
    const check = async () => {
      const state = useStore.getState();
      const tracked = Object.values(state.tabs).filter((tab) => !!tab.path);
      if (tracked.length === 0) return;
      try {
        const info = await api.fileMtimes(
          tracked.map((tab) => tab.path as string),
        );
        for (const tab of tracked) {
          const current = useStore.getState().tabs[tab.id];
          if (!current || current.path !== tab.path) continue;
          const entry = info[tab.path as string];
          if (!entry) continue;
          if (!entry.exists) {
            void useStore.getState().handleFsEvent({
              type: "deleted",
              path: tab.path as string,
              is_directory: false,
            });
          } else if (
            entry.modified_ms != null &&
            current.diskModifiedMs != null &&
            entry.modified_ms !== current.diskModifiedMs
          ) {
            void useStore.getState().handleFsEvent({
              type: "modified",
              path: tab.path as string,
              is_directory: false,
            });
          }
        }
      } catch {
        /* metadata check is best-effort */
      }
    };
    const onFocus = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void check(), 400);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer) window.clearTimeout(timer);
    };
  }, [ready]);

  // Filesystem watcher events.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const stop = await listen<FsEvent>("fs-event", (event) => {
          void useStore.getState().handleFsEvent(event.payload);
        });
        if (disposed) stop();
        else unlisten = stop;
      } catch (error) {
        console.warn("watcher unavailable", error);
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Files opened from Explorer while this instance is already running.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const stop = await listen<string>("open-file", (event) => {
          if (event.payload) {
            void useStore.getState().openPath(event.payload, false);
          }
        });
        if (disposed) stop();
        else unlisten = stop;
      } catch (error) {
        console.warn("open-file listener unavailable", error);
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Native drag & drop of files and folders onto the window.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const stop = await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === "over") {
            useStore.setState({ dragOver: true });
          } else if (payload.type === "leave") {
            useStore.setState({ dragOver: false });
          } else if (payload.type === "drop") {
            useStore.setState({ dragOver: false });
            void handleDroppedPaths(payload.paths, payload.position);
          }
        });
        if (disposed) stop();
        else unlisten = stop;
      } catch (error) {
        console.warn("drag and drop unavailable", error);
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Global shortcuts. Capture phase so CodeMirror's own bindings do not win.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const state = useStore.getState();

      const consume = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      if (event.key === "F11") {
        consume();
        void state.toggleZen();
        return;
      }

      if (event.key === "Escape") {
        // Let an open SelectMenu close itself instead of closing the whole
        // Settings dialog underneath it.
        if (document.querySelector(".select-menu")) return;
        if (state.settingsOpen) {
          consume();
          useStore.setState({ settingsOpen: false });
        } else if (state.diffOpen) {
          consume();
          useStore.setState({ diffOpen: false });
        } else if (state.searchFilesOpen) {
          consume();
          useStore.setState({ searchFilesOpen: false });
        }
        return;
      }

      if (!ctrl) return;

      if (key === "enter") {
        consume();
        window.dispatchEvent(new Event("markview:preview-update"));
        return;
      }

      if (key === "tab") {
        consume();
        const order = state.order;
        if (order.length < 2 || !state.activeId) return;
        const index = order.indexOf(state.activeId);
        const delta = event.shiftKey ? -1 : 1;
        state.activate(order[(index + delta + order.length) % order.length]);
        return;
      }

      if (event.shiftKey && key === "s") {
        consume();
        void saveActiveAs();
        return;
      }

      if (event.shiftKey && key === "o") {
        consume();
        void state.openFolder();
        return;
      }

      if (event.shiftKey && key === "f") {
        consume();
        useStore.setState({ searchFilesOpen: true });
        return;
      }

      if (event.shiftKey && key === "p") {
        consume();
        useStore.setState({ paletteOpen: true });
        return;
      }

      if (event.shiftKey && key === "v") {
        consume();
        state.togglePreview();
        return;
      }

      if (event.shiftKey && key === "k") {
        consume();
        applyFormat(editorRef.view, "code");
        return;
      }

      if (event.shiftKey && key === "w") {
        consume();
        void state.closeAll();
        return;
      }

      if (event.shiftKey && key === "t") {
        consume();
        void state.reopenClosedTab();
        return;
      }

      if (event.shiftKey && key === "e") {
        consume();
        useStore.setState({ exportOpen: true });
        return;
      }

      if (event.altKey && key === "s") {
        consume();
        void state.saveAll();
        return;
      }

      switch (key) {
        case "n":
          consume();
          state.createTab();
          return;
        case "o":
          consume();
          void state.openFileDialog();
          return;
        case "s":
          consume();
          void state.saveActive();
          return;
        case "w":
          consume();
          if (state.activeId) void state.closeTab(state.activeId);
          return;
        case "p":
          consume();
          useStore.setState({ quickOpenOpen: true, quickOpenMode: "files" });
          return;
        case "r":
          consume();
          useStore.setState({ quickOpenOpen: true, quickOpenMode: "recent" });
          return;
        case "f":
          consume();
          openFind(false);
          return;
        case "h":
          consume();
          openFind(true);
          return;
        case "b":
          consume();
          applyFormat(editorRef.view, "bold");
          return;
        case "i":
          consume();
          applyFormat(editorRef.view, "italic");
          return;
        case "k":
          consume();
          applyFormat(editorRef.view, "link");
          return;
        case "\\":
          consume();
          state.toggleSidebar();
          return;
        case ",":
          consume();
          useStore.setState({ settingsOpen: true });
          return;
        default:
          break;
      }

      // Ctrl+1..9 jump to a tab.
      if (/^[1-9]$/.test(key)) {
        consume();
        const target = state.order[Number(key) - 1];
        if (target) state.activate(target);
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  // Sidebar resizer.
  const startSidebarResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = useStore.getState().sidebarWidth;
    const onMove = (moveEvent: MouseEvent) => {
      useStore
        .getState()
        .setSidebarWidth(startWidth + moveEvent.clientX - startX);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      const width = useStore.getState().sidebarWidth;
      void persistSettings({ appearance: { sidebar_width: width } });
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Editor / preview split resizer.
  const startEditorResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    const container = document.getElementById("editor-preview-container");
    const editor = document.getElementById("editor-panel");
    if (!container || !editor) return;
    const startX = event.clientX;
    const startWidth = editor.getBoundingClientRect().width;
    const maxWidth = container.getBoundingClientRect().width - 220;

    const onMove = (moveEvent: MouseEvent) => {
      const width = Math.max(
        220,
        Math.min(maxWidth, startWidth + moveEvent.clientX - startX),
      );
      editor.style.flex = "0 0 auto";
      editor.style.width = `${width}px`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const splitMode = viewMode === "split";
  const previewShown = !splitMode || previewVisible;
  const previewActive = splitMode ? previewVisible : singleView === "preview";

  return (
    <>
      <div className="app-shell">
        <AppBar />
        <TabBar />
        <div id="main-container">
          <Sidebar />
          {sidebarVisible && (
            <div
              id="sidebar-resizer"
              onMouseDown={startSidebarResize}
              title="Drag to resize"
            />
          )}
          <div id="editor-area">
            {openTabCount === 0 && <EmptyState />}
            <div id="editor-preview-container">
              <EditorPane />
              {splitMode && previewVisible && (
                <div
                  id="editor-preview-resizer"
                  onMouseDown={startEditorResize}
                  title="Drag to resize"
                />
              )}
              <PreviewPane hidden={!previewShown} active={previewActive} />
              <FindBar />
            </div>
          </div>
        </div>
        <StatusBar />
      </div>

      {banners.map((banner, index) => (
        <div
          className="file-change-banner"
          key={banner.id}
          style={{ top: `calc(var(--shell-pad) + 108px + ${index * 48}px)` }}
        >
          <span>{banner.message}</span>
          <button
            onClick={() => {
              void useStore.getState().reloadTab(banner.tabId);
            }}
          >
            Reload
          </button>
          <button
            className="banner-dismiss"
            title="Dismiss"
            onClick={() => useStore.getState().dismissBanner(banner.id)}
          >
            ✕
          </button>
        </div>
      ))}

      <QuickOpen />
      <SaveAsDialog />
      <ExportDialog />
      <CommandPalette />
      <SearchInFiles />
      <SettingsDialog />
      <DiffDialog />
      <ContextMenu />
      <Toaster />
      <PromptDialog />
    </>
  );
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

async function handleDroppedPaths(
  paths: string[],
  position?: { x: number; y: number },
): Promise<void> {
  const store = useStore.getState();
  if (!paths.length) return;

  if (position) {
    const scale = window.devicePixelRatio || 1;
    const target = document.elementFromPoint(
      position.x / scale,
      position.y / scale,
    );
    const overEditor = !!target?.closest("#editor-panel");
    const images = paths.filter((path) => IMAGE_EXTENSIONS.test(path));
    if (overEditor && images.length > 0) {
      await insertDroppedImages(images);
      return;
    }
  }

  if (paths.length === 1) {
    const kind = await api.pathKind(paths[0]).catch(() => "missing");
    if (kind === "directory") {
      await store.loadFolder(paths[0]);
      return;
    }
    if (kind === "file") {
      await store.openPath(paths[0], false);
      return;
    }
  }

  for (const path of paths) {
    const kind = await api.pathKind(path).catch(() => "missing");
    if (kind === "file") await store.openPath(path, false);
  }
}

async function insertDroppedImages(paths: string[]): Promise<void> {
  const store = useStore.getState();
  const tab = store.activeId ? store.tabs[store.activeId] : null;
  if (!tab?.path) {
    toast.show("Save the file first before inserting images.", {
      type: "warn",
    });
    return;
  }

  const folder = `${dirname(tab.path)}/assets`;
  const snippets: string[] = [];
  for (const source of paths.slice(0, 10)) {
    try {
      const result = await api.importImage(source, folder);
      if (result?.error || !result?.name) {
        toast.show(result?.error ?? "Could not import image", {
          type: "error",
        });
        continue;
      }
      snippets.push(`![${result.name}](assets/${result.name})`);
    } catch (error) {
      toast.show(`Image import failed: ${String(error)}`, { type: "error" });
    }
  }
  if (snippets.length > 0) {
    const current = useStore.getState();
    if (
      current.activeId !== tab.id ||
      current.tabs[tab.id]?.path !== tab.path
    ) {
      toast.show("Images saved, but the active tab changed before insertion.", {
        type: "warn",
      });
      return;
    }
    editorRef.insertText?.(`${snippets.join("\n\n")}\n`);
    toast.show(
      `Inserted ${snippets.length} image${snippets.length === 1 ? "" : "s"}`,
      { type: "success", duration: 1500 },
    );
  }
}
