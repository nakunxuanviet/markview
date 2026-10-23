import { create } from "zustand";

import { api, pickFolder, pickSavePath } from "./api";
import { editorRef } from "./editorRef";
import { toast } from "./toast";
import type {
  AppSettings,
  Banner,
  FileData,
  FsEvent,
  Heading,
  SingleView,
  Tab,
  Theme,
  TreeNode,
  ViewMode,
} from "./types";
import { basename, normalizePath, parseHeadings } from "./utils";

let tabSeq = 0;
const nextId = () => `tab_${Date.now()}_${++tabSeq}`;

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: {
    theme: "dark",
    font_family_editor: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
    font_family_preview:
      '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
    font_size_editor: 14,
    font_size_preview: 15,
    zoom_level: 1,
    zoom_enabled: false,
    sidebar_width: 250,
    sidebar_visible: true,
    preview_visible: true,
    preview_position: "right",
    show_toolbar: true,
    show_statusbar: true,
    show_line_numbers: true,
    show_minimap: false,
  },
  editor: {
    word_wrap: true,
    tab_size: 4,
    insert_spaces: true,
    auto_close_brackets: true,
    auto_indent: true,
    highlight_active_line: true,
    match_brackets: true,
    code_folding: false,
  },
  files: {
    auto_save: false,
    auto_save_interval: 30,
    default_encoding: "utf-8",
    default_line_ending: "lf",
    visible_extensions: [".md", ".markdown", ".mdx", ".txt"],
    show_hidden_files: false,
    sort_by: "name_asc",
    folders_first: true,
    folder_label_segments: 2,
    exclude_patterns: ["node_modules", ".git", "__pycache__", ".DS_Store"],
  },
  preview: {
    scroll_sync: true,
    render_mermaid: true,
    render_math: true,
    double_click_preview: true,
    code_theme: "github-dark",
  },
  session: {
    restore_session: true,
    backup_interval: 5,
    remember_folder: true,
  },
  recent_files: [],
  recent_folders: [],
  language: "en",
};

function deepMerge<T>(base: T, patch: unknown): T {
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    return patch === undefined ? base : (patch as T);
  }
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    out[key] = key in out ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

function currentEditorContent(): string {
  return editorRef.view ? editorRef.view.state.doc.toString() : "";
}

function mapNode(
  nodes: TreeNode[],
  path: string,
  fn: (node: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) return fn(node);
    if (node.children && node.children.length) {
      return { ...node, children: mapNode(node.children, path, fn) };
    }
    return node;
  });
}

function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

export interface AppStore {
  ready: boolean;
  settings: AppSettings;
  theme: Theme;

  viewMode: ViewMode;
  singleView: SingleView;
  sidebarVisible: boolean;
  previewVisible: boolean;
  sidebarWidth: number;
  zenMode: boolean;
  dragOver: boolean;

  tabs: Record<string, Tab>;
  order: string[];
  activeId: string | null;
  previewTabId: string | null;
  /** Id of the tab whose text the CodeMirror view currently holds. */
  editorTabId: string | null;

  workspace: string | null;
  tree: TreeNode[];
  expanded: Record<string, boolean>;
  showWelcome: boolean;
  recentFolders: string[];

  headings: Heading[];
  banners: Banner[];

  settingsOpen: boolean;
  findOpen: boolean;
  quickOpenOpen: boolean;
  paletteOpen: boolean;
  searchFilesOpen: boolean;
  diffOpen: boolean;
  diffLeft: string;
  diffRight: string;
  diffLeftLabel: string;
  diffRightLabel: string;

  init: () => Promise<void>;
  createTab: (opts?: Partial<Tab>) => string;
  activate: (id: string) => void;
  removeTab: (id: string) => void;
  closeTab: (id: string) => Promise<void>;
  closeOthers: (id: string) => Promise<void>;
  closeAll: () => Promise<void>;
  closeToRight: (id: string) => Promise<void>;
  saveTab: (id: string) => Promise<boolean>;
  saveActive: () => Promise<boolean>;
  markModified: (id: string) => void;
  snapshotActive: () => void;
  replaceTabContent: (id: string, content: string, markClean?: boolean) => void;

  openPath: (path: string, isPreview?: boolean) => Promise<void>;
  openFileDialog: () => Promise<void>;
  openFileData: (data: FileData, isPreview?: boolean) => Tab | null;
  openFolder: () => Promise<void>;
  loadFolder: (path: string) => Promise<boolean>;
  refreshTree: () => Promise<void>;
  toggleFolder: (path: string) => Promise<void>;
  revealActiveInTree: (path: string) => void;

  setViewMode: (mode: ViewMode) => void;
  showSingleView: (view: SingleView) => void;
  showEditorView: () => void;
  toggleSidebar: () => void;
  togglePreview: () => void;
  toggleTheme: () => void;
  setSidebarWidth: (width: number) => void;
  toggleZen: () => Promise<void>;

  updateSettings: (patch: Record<string, unknown>) => Promise<void>;
  setHeadings: (headings: Heading[]) => void;
  refreshHeadings: () => void;

  handleFsEvent: (event: FsEvent) => Promise<void>;
  dismissBanner: (id: string) => void;
  reloadTab: (id: string) => Promise<void>;

  buildSession: () => Record<string, unknown>;
  saveSession: () => Promise<void>;
}

export const useStore = create<AppStore>((set, get) => ({
  ready: false,
  settings: DEFAULT_SETTINGS,
  theme: "dark",

  viewMode: "single",
  singleView: "editor",
  sidebarVisible: true,
  previewVisible: true,
  sidebarWidth: 250,
  zenMode: false,
  dragOver: false,

  tabs: {},
  order: [],
  activeId: null,
  previewTabId: null,
  editorTabId: null,

  workspace: null,
  tree: [],
  expanded: {},
  showWelcome: true,
  recentFolders: [],

  headings: [],
  banners: [],

  settingsOpen: false,
  findOpen: false,
  quickOpenOpen: false,
  paletteOpen: false,
  searchFilesOpen: false,
  diffOpen: false,
  diffLeft: "",
  diffRight: "",
  diffLeftLabel: "Original",
  diffRightLabel: "Modified",

  init: async () => {
    let settings = DEFAULT_SETTINGS;
    try {
      const loaded = await api.getSettings();
      if (loaded) settings = deepMerge(DEFAULT_SETTINGS, loaded);
    } catch (error) {
      console.error("Failed to load settings", error);
    }

    set({
      settings,
      theme: settings.appearance.theme,
      sidebarVisible: settings.appearance.sidebar_visible !== false,
      previewVisible: settings.appearance.preview_visible !== false,
      sidebarWidth: settings.appearance.sidebar_width || 250,
      recentFolders: settings.recent_folders ?? [],
    });

    // Restore the previous session when enabled.
    let restored = false;
    if (settings.session.restore_session !== false) {
      try {
        const session = await api.loadSession();
        if (session) {
          const tabs: Record<string, Tab> = {};
          const order: string[] = [];
          for (const id of session.tab_order ?? []) {
            const data = session.tabs?.[id];
            if (!data) continue;
            tabs[id] = {
              id,
              path: data.path ?? null,
              filename:
                data.filename || (data.path ? basename(data.path) : "Untitled"),
              content: data.content ?? "",
              modified: data.modified ?? false,
              cursorPos: data.cursor_pos ?? 0,
              scrollTop: data.scroll_top ?? 0,
              isPreview: false,
              encoding: "UTF-8",
            };
            order.push(id);
          }

          // Re-establish trust for the workspace and for files opened last
          // time, otherwise Save would be rejected by the path validator.
          const paths = order
            .map((id) => tabs[id].path)
            .filter((path): path is string => !!path);
          try {
            const workspaceRestore = await api.restoreWorkspace(
              session.workspace_folder ?? null,
              paths,
            );
            if (workspaceRestore?.workspace) {
              set({
                workspace: workspaceRestore.workspace,
                tree: workspaceRestore.tree ?? [],
                showWelcome: false,
              });
            }
          } catch (error) {
            console.warn("workspace restore failed", error);
          }

          const active =
            session.active_tab && tabs[session.active_tab]
              ? session.active_tab
              : (order[0] ?? null);
          if (order.length > 0) {
            set({ tabs, order, activeId: active });
            restored = true;
          }
        }
      } catch (error) {
        console.error("Failed to restore session", error);
      }
    }

    if (!restored) {
      try {
        const recent = await api.getRecentFolders();
        set({ recentFolders: recent ?? [], showWelcome: true });
      } catch {
        /* ignore */
      }
      get().createTab();
    }

    set({ ready: true });
    get().refreshHeadings();

    // A markdown file handed to us by Explorer at launch.
    try {
      const launchFile = await api.takeLaunchFile();
      if (launchFile) await get().openPath(launchFile, false);
    } catch (error) {
      console.warn("launch file unavailable", error);
    }
  },

  createTab: (opts = {}) => {
    get().snapshotActive();
    const id = opts.id ?? nextId();
    const tab: Tab = {
      id,
      path: opts.path ?? null,
      filename: opts.filename ?? "Untitled",
      content: opts.content ?? "",
      modified: opts.modified ?? false,
      cursorPos: opts.cursorPos ?? 0,
      scrollTop: opts.scrollTop ?? 0,
      isPreview: opts.isPreview ?? false,
      encoding: opts.encoding ?? "UTF-8",
    };
    set((state) => ({
      tabs: { ...state.tabs, [id]: tab },
      order: [...state.order, id],
      activeId: id,
    }));
    get().showEditorView();
    get().refreshHeadings();
    return id;
  },

  activate: (id) => {
    const state = get();
    if (!state.tabs[id] || state.activeId === id) return;
    state.snapshotActive();
    set({ activeId: id });
    get().refreshHeadings();
  },

  removeTab: (id) => {
    const state = get();
    if (!state.tabs[id]) return;
    state.snapshotActive();

    const idx = state.order.indexOf(id);
    const order = state.order.filter((tabId) => tabId !== id);
    const tabs = { ...state.tabs };
    delete tabs[id];

    let activeId = state.activeId;
    if (state.activeId === id) {
      if (order.length > 0) {
        activeId = order[Math.min(idx, order.length - 1)];
      } else {
        activeId = null;
      }
    }

    set({
      tabs,
      order,
      activeId,
      previewTabId: state.previewTabId === id ? null : state.previewTabId,
    });
    get().refreshHeadings();
  },

  closeTab: async (id) => {
    const tab = get().tabs[id];
    if (!tab) return;
    if (tab.modified) {
      const choice = await toast.choose(
        `"${tab.filename}" has unsaved changes. Save before closing?`,
        { saveText: "Save", discardText: "Don't Save", cancelText: "Cancel" },
      );
      if (choice === "cancel") return;
      if (choice === "save") {
        const ok = await get().saveTab(id);
        if (!ok) return;
      }
    }
    get().removeTab(id);
  },

  closeOthers: async (id) => {
    const ids = get().order.filter((tabId) => tabId !== id);
    for (const tabId of ids) {
      await get().closeTab(tabId);
    }
  },

  closeAll: async () => {
    for (const id of [...get().order]) {
      await get().closeTab(id);
    }
  },

  closeToRight: async (id) => {
    const order = get().order;
    const idx = order.indexOf(id);
    for (const tabId of order.slice(idx + 1)) {
      await get().closeTab(tabId);
    }
  },

  saveTab: async (id) => {
    const tab = get().tabs[id];
    if (!tab) return false;

    const content =
      get().activeId === id ? currentEditorContent() : tab.content;

    if (tab.path) {
      try {
        const result = await api.saveFile(tab.path, content);
        if (result?.success) {
          set((state) => ({
            tabs: {
              ...state.tabs,
              [id]: { ...state.tabs[id], content, modified: false },
            },
          }));
          toast.show(`Saved ${tab.filename}`, {
            type: "success",
            duration: 1500,
          });
          return true;
        }
        toast.show(result?.error ?? "Save failed", { type: "error" });
      } catch (error) {
        toast.show(`Save failed: ${String(error)}`, { type: "error" });
      }
      return false;
    }

    const suggested = /\.[a-z0-9]{1,8}$/i.test(tab.filename)
      ? tab.filename
      : `${tab.filename}.md`;
    const path = await pickSavePath(suggested);
    if (!path) return false;

    try {
      const result = await api.saveFileAs(path, content);
      if (result?.success) {
        set((state) => ({
          tabs: {
            ...state.tabs,
            [id]: {
              ...state.tabs[id],
              path: result.path ?? path,
              filename: basename(result.path ?? path),
              content,
              modified: false,
            },
          },
        }));
        toast.show(`Saved ${basename(path)}`, {
          type: "success",
          duration: 1500,
        });
        await get().refreshTree();
        return true;
      }
      toast.show(result?.error ?? "Save failed", { type: "error" });
    } catch (error) {
      toast.show(`Save failed: ${String(error)}`, { type: "error" });
    }
    return false;
  },

  saveActive: async () => {
    const id = get().activeId;
    if (!id) return false;
    return get().saveTab(id);
  },

  markModified: (id) => {
    const tab = get().tabs[id];
    if (!tab || tab.modified) return;
    set((state) => ({
      tabs: { ...state.tabs, [id]: { ...state.tabs[id], modified: true } },
    }));
  },

  snapshotActive: () => {
    const state = get();
    const id = state.activeId;
    if (!id || !state.tabs[id] || !editorRef.view) return;
    const content = currentEditorContent();
    const view = editorRef.view;
    set((current) => ({
      tabs: {
        ...current.tabs,
        [id]: {
          ...current.tabs[id],
          content,
          cursorPos: view.state.selection.main.head,
          scrollTop: view.scrollDOM.scrollTop,
        },
      },
    }));
  },

  replaceTabContent: (id, content, markClean = true) => {
    const tab = get().tabs[id];
    if (!tab) return;
    set((state) => ({
      tabs: {
        ...state.tabs,
        [id]: {
          ...state.tabs[id],
          content,
          modified: markClean ? false : tab.modified,
        },
      },
    }));
    if (get().activeId === id) {
      editorRef.setDoc?.(content);
    }
    get().refreshHeadings();
  },

  openPath: async (path, isPreview = false) => {
    try {
      const data = await api.openFileByPath(path);
      if (!data || data.error) {
        toast.show(data?.error ?? "Could not open file", { type: "error" });
        return;
      }
      get().openFileData(data, isPreview);
    } catch (error) {
      toast.show(`Could not open file: ${String(error)}`, { type: "error" });
    }
  },

  openFileDialog: async () => {
    const path = await pickFileSafe();
    if (!path) return;
    await get().openPath(path, false);
  },

  openFileData: (data, isPreview = false) => {
    if (!data.path) return null;
    const state = get();
    const existing = Object.values(state.tabs).find(
      (tab) =>
        tab.path && normalizePath(tab.path) === normalizePath(data.path!),
    );

    if (existing) {
      const content = data.content ?? existing.content;
      set((current) => ({
        tabs: {
          ...current.tabs,
          [existing.id]: {
            ...current.tabs[existing.id],
            content,
            filename: data.filename ?? existing.filename,
            encoding: data.encoding ?? existing.encoding,
            isPreview: isPreview ? current.tabs[existing.id].isPreview : false,
          },
        },
        previewTabId:
          !isPreview && current.previewTabId === existing.id
            ? null
            : current.previewTabId,
      }));
      get().activate(existing.id);
      if (state.activeId === existing.id) {
        // Same tab, but the file may have changed on disk.
        editorRef.setDoc?.(content);
        get().refreshHeadings();
      } else {
        editorRef.setDoc?.(content);
      }
      return get().tabs[existing.id] ?? null;
    }

    if (isPreview && state.previewTabId && state.tabs[state.previewTabId]) {
      get().removeTab(state.previewTabId);
    }

    const id = get().createTab({
      path: data.path,
      filename: data.filename ?? basename(data.path),
      content: data.content ?? "",
      encoding: data.encoding ?? "UTF-8",
      isPreview,
    });
    if (isPreview) set({ previewTabId: id });
    return get().tabs[id] ?? null;
  },

  openFolder: async () => {
    const path = await pickFolderSafe();
    if (!path) return;
    await get().loadFolder(path);
  },

  loadFolder: async (path) => {
    try {
      const result = await api.openFolder(path);
      if (!result) return false;
      set({
        workspace: result.path,
        tree: result.tree ?? [],
        expanded: {},
        showWelcome: false,
      });
      return true;
    } catch (error) {
      toast.show(`Could not open folder: ${String(error)}`, { type: "error" });
      return false;
    }
  },

  refreshTree: async () => {
    const workspace = get().workspace;
    if (!workspace) return;
    try {
      const result = await api.getFolderTree(workspace);
      if (result) set({ tree: result.tree ?? [] });
    } catch {
      /* folder may have been removed */
    }
  },

  toggleFolder: async (path) => {
    const state = get();
    const isExpanded = !!state.expanded[path];
    if (isExpanded) {
      set({ expanded: { ...state.expanded, [path]: false } });
      return;
    }
    const node = findNode(state.tree, path);
    if (node && (!node.children || node.children.length === 0)) {
      try {
        const children = await api.getFolderChildren(path);
        set((current) => ({
          tree: mapNode(current.tree, path, (item) => ({
            ...item,
            children: children ?? [],
          })),
        }));
      } catch {
        /* ignore */
      }
    }
    set((current) => ({ expanded: { ...current.expanded, [path]: true } }));
  },

  revealActiveInTree: (path) => {
    const { workspace, expanded } = get();
    if (!workspace) return;
    const root = normalizePath(workspace);
    const target = normalizePath(path);
    if (!target.startsWith(root)) return;
    const parts = target.slice(root.length + 1).split("/");
    parts.pop();
    const next = { ...expanded };
    let cursor = workspace.replace(/\\/g, "/");
    for (const part of parts) {
      cursor = `${cursor}/${part}`;
      next[cursor] = true;
      next[cursor.replace(/\//g, "\\")] = true;
    }
    set({ expanded: next });
  },

  setViewMode: (mode) => {
    if (mode === "split") {
      set({ viewMode: "split", previewVisible: true });
    } else {
      set({ viewMode: "single" });
    }
  },

  showSingleView: (view) => {
    set({ viewMode: "single", singleView: view });
    if (view === "editor") editorRef.view?.focus();
  },

  showEditorView: () => {
    set({ viewMode: "single", singleView: "editor" });
  },

  toggleSidebar: () => {
    const next = !get().sidebarVisible;
    set({ sidebarVisible: next });
    void api.saveSettings({ appearance: { sidebar_visible: next } });
  },

  togglePreview: () => {
    if (get().viewMode === "single") {
      set({
        singleView: get().singleView === "preview" ? "editor" : "preview",
      });
    } else {
      set({ previewVisible: !get().previewVisible });
    }
  },

  toggleTheme: () => {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    set({
      theme,
      settings: {
        ...get().settings,
        appearance: { ...get().settings.appearance, theme },
      },
    });
    void api.saveSettings({ appearance: { theme } });
  },

  setSidebarWidth: (width) => {
    const clamped = Math.max(150, Math.min(500, width));
    set({
      sidebarWidth: clamped,
      settings: {
        ...get().settings,
        appearance: { ...get().settings.appearance, sidebar_width: clamped },
      },
    });
  },

  toggleZen: async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const next = !get().zenMode;
    set({ zenMode: next });
    try {
      await getCurrentWindow().setFullscreen(next);
    } catch {
      /* ignore (browser preview) */
    }
  },

  updateSettings: async (patch) => {
    const merged = deepMerge(get().settings, patch);
    set({
      settings: merged,
      theme: merged.appearance.theme,
      sidebarVisible: merged.appearance.sidebar_visible !== false,
      previewVisible: merged.appearance.preview_visible !== false,
      sidebarWidth: merged.appearance.sidebar_width || 250,
    });
    try {
      await api.saveSettings(patch);
    } catch (error) {
      console.error("Failed to save settings", error);
    }
  },

  setHeadings: (headings) => set({ headings }),

  refreshHeadings: () => {
    const state = get();
    const id = state.activeId;
    if (!id || !state.tabs[id]) {
      set({ headings: [] });
      return;
    }
    const content =
      state.editorTabId === id && editorRef.view
        ? currentEditorContent()
        : state.tabs[id].content;
    set({ headings: parseHeadings(content) });
  },

  handleFsEvent: async (event) => {
    const state = get();
    if (event.type !== "modified") {
      await get().refreshTree();
    }

    if (event.type !== "modified" || event.is_directory) return;

    const target = normalizePath(event.path);
    const affected = Object.values(state.tabs).filter(
      (tab) => tab.path && normalizePath(tab.path) === target,
    );
    for (const tab of affected) {
      const banner: Banner = {
        id: `${tab.id}_${Date.now()}`,
        message: `${tab.filename} changed on disk.`,
        tabId: tab.id,
        path: tab.path!,
      };
      set((current) => ({
        banners: [...current.banners.filter((b) => b.tabId !== tab.id), banner],
      }));
    }
  },

  dismissBanner: (id) =>
    set((state) => ({ banners: state.banners.filter((b) => b.id !== id) })),

  reloadTab: async (id) => {
    const tab = get().tabs[id];
    if (!tab?.path) return;
    try {
      const data = await api.openFileByPath(tab.path);
      if (data?.error) {
        toast.show(data.error, { type: "error" });
        return;
      }
      get().replaceTabContent(id, data.content ?? "", true);
      set((state) => ({
        banners: state.banners.filter((b) => b.tabId !== id),
      }));
      if (get().activeId === id) get().refreshHeadings();
    } catch (error) {
      toast.show(`Reload failed: ${String(error)}`, { type: "error" });
    }
  },

  buildSession: () => {
    const state = get();
    const tabs: Record<string, unknown> = {};
    for (const [id, tab] of Object.entries(state.tabs)) {
      // Only trust the live editor text when the view actually holds this tab;
      // during start-up (and after remounts) the view may still be empty.
      const hydrated =
        state.activeId === id && state.editorTabId === id && !!editorRef.view;
      const content = hydrated ? currentEditorContent() : tab.content;
      tabs[id] = {
        path: tab.path,
        filename: tab.filename,
        content,
        cursor_pos: hydrated
          ? (editorRef.view?.state.selection.main.head ?? tab.cursorPos)
          : tab.cursorPos,
        scroll_top: hydrated
          ? (editorRef.view?.scrollDOM.scrollTop ?? tab.scrollTop)
          : tab.scrollTop,
        modified: tab.modified,
      };
    }
    return {
      tabs,
      tab_order: state.order,
      active_tab: state.activeId,
      workspace_folder: state.workspace,
      sidebar_width: state.sidebarWidth,
      sidebar_collapsed: !state.sidebarVisible,
    };
  },

  saveSession: async () => {
    try {
      await api.saveSession(get().buildSession());
    } catch (error) {
      console.error("Failed to save session", error);
    }
  },
}));

async function pickFolderSafe(): Promise<string | null> {
  try {
    return await pickFolder();
  } catch (error) {
    console.error("Folder dialog failed", error);
    return null;
  }
}

async function pickFileSafe(): Promise<string | null> {
  try {
    const { pickFile } = await import("./api");
    return await pickFile();
  } catch (error) {
    console.error("File dialog failed", error);
    return null;
  }
}
