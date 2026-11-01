import { create } from "zustand";

import { api, pickFile, pickFolder, pickSavePath } from "./api";
import { editorRef } from "./editorRef";
import { toast } from "./toast";
import type {
  AppSettings,
  Banner,
  FileData,
  FsEvent,
  Heading,
  LineEnding,
  SingleView,
  Tab,
  Theme,
  TreeNode,
  ViewMode,
} from "./types";
import {
  basename,
  dirname,
  normalizeNewlines,
  normalizePath,
  parseHeadings,
} from "./utils";

let tabSeq = 0;
const nextId = () => `tab_${Date.now()}_${++tabSeq}`;

/** Content revisions live outside the store so typing never re-renders it. */
const tabRevisions = new Map<string, number>();
const backedUpRevisions = new Map<string, number>();
let lastSavedMetaHash = "";
let sessionSavePromise: Promise<void> | null = null;
let fileSaveChain: Promise<unknown> = Promise.resolve();
let saveAllRunning = false;
let settingsWriteFailed = false;
let settingsPersistChain: Promise<void> = Promise.resolve();
let pendingSettingsPatch: Record<string, unknown> | null = null;
let settingsPersistTimer: number | undefined;
let refreshTreeAfterSettings = false;
let treeRequestSeq = 0;
let treeErrorShown = false;

const MAX_CLOSED_TABS = 20;
const MAX_CLOSED_TAB_BYTES = 64 * 1024 * 1024;

/** Keep the closed-tab recovery stack bounded in both count and memory. */
function trimClosedTabs(stack: Tab[]): Tab[] {
  const kept: Tab[] = [];
  let bytes = 0;
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const tab = stack[index];
    const size = tab.content.length * 2;
    if (kept.length >= MAX_CLOSED_TABS) break;
    if (kept.length > 0 && bytes + size > MAX_CLOSED_TAB_BYTES) break;
    kept.unshift(tab);
    bytes += size;
  }
  return kept;
}

async function writeSettings(patch: Record<string, unknown>): Promise<void> {
  try {
    const ok = await api.saveSettings(patch);
    if (ok) {
      settingsWriteFailed = false;
      return;
    }
  } catch (error) {
    console.error("Failed to save settings", error);
  }
  if (!settingsWriteFailed) {
    settingsWriteFailed = true;
    toast.show("Could not save settings to disk.", {
      type: "error",
      duration: 6000,
    });
  }
}

/** Persist a settings patch in invocation order, reporting a write failure
 * once instead of on every keystroke/toggle in a burst. */
export function persistSettings(patch: Record<string, unknown>): Promise<void> {
  const next = settingsPersistChain.then(
    () => writeSettings(patch),
    () => writeSettings(patch),
  );
  settingsPersistChain = next.catch(() => undefined);
  return next;
}

/** Coalesce settings writes during continuous typing in Settings. */
function queueSettingsPersist(patch: Record<string, unknown>): void {
  pendingSettingsPatch = pendingSettingsPatch
    ? deepMerge(pendingSettingsPatch, patch)
    : patch;
  if (settingsPersistTimer !== undefined) {
    window.clearTimeout(settingsPersistTimer);
  }
  settingsPersistTimer = window.setTimeout(() => {
    settingsPersistTimer = undefined;
    const pending = pendingSettingsPatch;
    pendingSettingsPatch = null;
    if (pending) {
      void persistSettings(pending).then(() => {
        if (refreshTreeAfterSettings) {
          refreshTreeAfterSettings = false;
          scheduleTreeRefresh(() => useStore.getState().refreshTree());
        }
      });
    }
  }, 300);
}

/** Flush a queued settings patch before the process exits. */
export async function flushSettingsPersist(): Promise<void> {
  if (settingsPersistTimer !== undefined) {
    window.clearTimeout(settingsPersistTimer);
    settingsPersistTimer = undefined;
  }
  const pending = pendingSettingsPatch;
  pendingSettingsPatch = null;
  if (pending) await persistSettings(pending);
  await settingsPersistChain;
  if (refreshTreeAfterSettings) {
    refreshTreeAfterSettings = false;
    scheduleTreeRefresh(() => useStore.getState().refreshTree());
  }
}

/**
 * Async Rust commands run on a threadpool, so two rapid saves of the same tab
 * could otherwise land on disk out of order. Serialize writes in invocation
 * order; a failed write does not break the chain.
 */
function serializeFileSave<T>(task: () => Promise<T>): Promise<T> {
  const next = fileSaveChain.then(task, task);
  fileSaveChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

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
    show_toolbar: true,
    show_statusbar: true,
    show_line_numbers: true,
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
    spellcheck: false,
  },
  files: {
    auto_save: false,
    auto_save_interval: 30,
    default_encoding: "UTF-8",
    default_line_ending: "lf",
    visible_extensions: [".md", ".markdown", ".mdx", ".txt"],
    show_hidden_files: false,
    folders_first: true,
    folder_label_segments: 2,
    exclude_patterns: ["node_modules", ".git", "__pycache__", ".DS_Store"],
  },
  preview: {
    scroll_sync: true,
    render_mermaid: true,
    render_math: true,
    double_click_preview: true,
  },
  session: {
    restore_session: true,
    backup_interval: 10,
  },
  recent_files: [],
  recent_folders: [],
};

function normalizeEncodingLabel(value?: string): string {
  const label = (value ?? "utf-8").toLowerCase();
  if (label.includes("bom") || label.includes("sig")) return "UTF-8 BOM";
  if (label.includes("utf-16") && label.includes("be")) return "UTF-16 BE";
  if (label.includes("utf-16")) return "UTF-16 LE";
  if (label.includes("1252")) return "Windows-1252";
  if (label.includes("shift")) return "Shift_JIS";
  return "UTF-8";
}

function normalizeLineEnding(value?: string): LineEnding {
  return value === "crlf" ? "crlf" : value === "cr" ? "cr" : "lf";
}

function defaultBom(encoding: string): boolean {
  return encoding === "UTF-8 BOM" || encoding.startsWith("UTF-16");
}

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

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asBoundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  let number: number;
  if (typeof value === "number") {
    number = value;
  } else if (typeof value === "string" && value.trim()) {
    number = Number(value);
  } else {
    return fallback;
  }
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function asStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Settings are user-editable JSON and can survive version changes. Coerce
 * sections that the UI maps over (arrays), clamp numeric controls, and keep
 * unknown keys for forward compatibility.
 */
export function sanitizeSettings(settings: AppSettings): AppSettings {
  const appearance = {
    ...settings.appearance,
    theme: (settings.appearance.theme === "light" ? "light" : "dark") as Theme,
    font_family_editor: asText(
      settings.appearance.font_family_editor,
      DEFAULT_SETTINGS.appearance.font_family_editor,
    ),
    font_family_preview: asText(
      settings.appearance.font_family_preview,
      DEFAULT_SETTINGS.appearance.font_family_preview,
    ),
    font_size_editor: asBoundedNumber(
      settings.appearance.font_size_editor,
      DEFAULT_SETTINGS.appearance.font_size_editor,
      10,
      32,
    ),
    font_size_preview: asBoundedNumber(
      settings.appearance.font_size_preview,
      DEFAULT_SETTINGS.appearance.font_size_preview,
      10,
      32,
    ),
    zoom_level: asBoundedNumber(
      settings.appearance.zoom_level,
      DEFAULT_SETTINGS.appearance.zoom_level,
      0.5,
      2.5,
    ),
    zoom_enabled: asBool(
      settings.appearance.zoom_enabled,
      DEFAULT_SETTINGS.appearance.zoom_enabled,
    ),
    sidebar_width: asBoundedNumber(
      settings.appearance.sidebar_width,
      DEFAULT_SETTINGS.appearance.sidebar_width,
      150,
      500,
    ),
    sidebar_visible: asBool(
      settings.appearance.sidebar_visible,
      DEFAULT_SETTINGS.appearance.sidebar_visible,
    ),
    preview_visible: asBool(
      settings.appearance.preview_visible,
      DEFAULT_SETTINGS.appearance.preview_visible,
    ),
    show_toolbar: asBool(
      settings.appearance.show_toolbar,
      DEFAULT_SETTINGS.appearance.show_toolbar,
    ),
    show_statusbar: asBool(
      settings.appearance.show_statusbar,
      DEFAULT_SETTINGS.appearance.show_statusbar,
    ),
    show_line_numbers: asBool(
      settings.appearance.show_line_numbers,
      DEFAULT_SETTINGS.appearance.show_line_numbers,
    ),
  };
  const editor = {
    ...settings.editor,
    word_wrap: asBool(
      settings.editor.word_wrap,
      DEFAULT_SETTINGS.editor.word_wrap,
    ),
    tab_size: asBoundedNumber(
      settings.editor.tab_size,
      DEFAULT_SETTINGS.editor.tab_size,
      1,
      8,
    ),
    insert_spaces: asBool(
      settings.editor.insert_spaces,
      DEFAULT_SETTINGS.editor.insert_spaces,
    ),
    auto_close_brackets: asBool(
      settings.editor.auto_close_brackets,
      DEFAULT_SETTINGS.editor.auto_close_brackets,
    ),
    auto_indent: asBool(
      settings.editor.auto_indent,
      DEFAULT_SETTINGS.editor.auto_indent,
    ),
    highlight_active_line: asBool(
      settings.editor.highlight_active_line,
      DEFAULT_SETTINGS.editor.highlight_active_line,
    ),
    match_brackets: asBool(
      settings.editor.match_brackets,
      DEFAULT_SETTINGS.editor.match_brackets,
    ),
    code_folding: asBool(
      settings.editor.code_folding,
      DEFAULT_SETTINGS.editor.code_folding,
    ),
    spellcheck: asBool(
      settings.editor.spellcheck,
      DEFAULT_SETTINGS.editor.spellcheck,
    ),
  };
  const visibleExtensions = asStringList(settings.files.visible_extensions);
  const excludePatterns = asStringList(settings.files.exclude_patterns);
  const files = {
    ...settings.files,
    auto_save: asBool(
      settings.files.auto_save,
      DEFAULT_SETTINGS.files.auto_save,
    ),
    auto_save_interval: asBoundedNumber(
      settings.files.auto_save_interval,
      DEFAULT_SETTINGS.files.auto_save_interval,
      5,
      600,
    ),
    default_encoding: normalizeEncodingLabel(
      asText(settings.files.default_encoding, "UTF-8"),
    ),
    default_line_ending: normalizeLineEnding(
      asText(settings.files.default_line_ending, "lf"),
    ),
    visible_extensions:
      visibleExtensions && visibleExtensions.length
        ? visibleExtensions
        : DEFAULT_SETTINGS.files.visible_extensions,
    show_hidden_files: asBool(
      settings.files.show_hidden_files,
      DEFAULT_SETTINGS.files.show_hidden_files,
    ),
    folders_first: asBool(
      settings.files.folders_first,
      DEFAULT_SETTINGS.files.folders_first,
    ),
    folder_label_segments: asBoundedNumber(
      settings.files.folder_label_segments,
      DEFAULT_SETTINGS.files.folder_label_segments,
      1,
      6,
    ),
    exclude_patterns:
      excludePatterns ?? DEFAULT_SETTINGS.files.exclude_patterns,
  };
  const preview = {
    ...settings.preview,
    scroll_sync: asBool(
      settings.preview.scroll_sync,
      DEFAULT_SETTINGS.preview.scroll_sync,
    ),
    render_mermaid: asBool(
      settings.preview.render_mermaid,
      DEFAULT_SETTINGS.preview.render_mermaid,
    ),
    render_math: asBool(
      settings.preview.render_math,
      DEFAULT_SETTINGS.preview.render_math,
    ),
    double_click_preview: asBool(
      settings.preview.double_click_preview,
      DEFAULT_SETTINGS.preview.double_click_preview,
    ),
  };
  const session = {
    ...settings.session,
    restore_session: asBool(
      settings.session.restore_session,
      DEFAULT_SETTINGS.session.restore_session,
    ),
    backup_interval: asBoundedNumber(
      settings.session.backup_interval,
      DEFAULT_SETTINGS.session.backup_interval,
      3,
      60,
    ),
  };
  return {
    ...settings,
    appearance,
    editor,
    files,
    preview,
    session,
    recent_files: asStringList(settings.recent_files) ?? [],
    recent_folders: asStringList(settings.recent_folders) ?? [],
  };
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

function pruneExpanded(
  tree: TreeNode[],
  expanded: Record<string, boolean>,
): Record<string, boolean> {
  const alive = new Set<string>();
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "folder") {
        alive.add(node.path);
        if (node.children) walk(node.children);
      }
    }
  };
  walk(tree);
  return Object.fromEntries(
    Object.entries(expanded).filter(([path, open]) => open && alive.has(path)),
  );
}

let treeRefreshTimer: number | undefined;
function scheduleTreeRefresh(refresh: () => Promise<void>) {
  if (treeRefreshTimer !== undefined) window.clearTimeout(treeRefreshTimer);
  treeRefreshTimer = window.setTimeout(() => {
    treeRefreshTimer = undefined;
    void refresh();
  }, 150);
}

function sortTreeChildren(
  nodes: TreeNode[],
  foldersFirst: boolean,
): TreeNode[] {
  return [...nodes].sort((left, right) => {
    if (foldersFirst && left.type !== right.type) {
      return left.type === "folder" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    });
  });
}

function insertTreeNode(
  nodes: TreeNode[],
  parentPath: string,
  node: TreeNode,
  foldersFirst: boolean,
): { tree: TreeNode[]; inserted: boolean } {
  let inserted = false;
  const tree = nodes.map((item) => {
    if (inserted) return item;
    if (item.type === "folder" && item.path === parentPath) {
      const children = item.children ? [...item.children] : [];
      if (
        children.some(
          (child) => normalizePath(child.path) === normalizePath(node.path),
        )
      ) {
        inserted = true;
        return item;
      }
      children.push(node);
      inserted = true;
      return {
        ...item,
        children: sortTreeChildren(children, foldersFirst),
      };
    }
    if (item.children) {
      const nested = insertTreeNode(
        item.children,
        parentPath,
        node,
        foldersFirst,
      );
      if (nested.inserted) {
        inserted = true;
        return { ...item, children: nested.tree };
      }
    }
    return item;
  });
  return { tree, inserted };
}

function removeTreeNode(
  nodes: TreeNode[],
  path: string,
): { tree: TreeNode[]; removed: TreeNode | null } {
  let removed: TreeNode | null = null;
  const tree: TreeNode[] = [];
  for (const item of nodes) {
    if (normalizePath(item.path) === normalizePath(path)) {
      removed = item;
      continue;
    }
    if (item.children) {
      const nested = removeTreeNode(item.children, path);
      if (nested.removed) {
        removed = nested.removed;
        tree.push({ ...item, children: nested.tree });
        continue;
      }
    }
    tree.push(item);
  }
  return { tree, removed };
}

function rebaseNode(
  node: TreeNode,
  oldPath: string,
  newPath: string,
): TreeNode {
  const oldNorm = normalizePath(oldPath);
  const norm = normalizePath(node.path);
  const nextPath =
    norm === oldNorm
      ? newPath
      : norm.startsWith(oldNorm + "/")
        ? `${newPath}${node.path.slice(oldPath.length)}`
        : node.path;
  return {
    ...node,
    path: nextPath,
    name: basename(nextPath),
    children: node.children?.map((child) =>
      rebaseNode(child, oldPath, newPath),
    ),
  };
}

function rebaseExpanded(
  expanded: Record<string, boolean>,
  oldPath: string,
  newPath: string,
): Record<string, boolean> {
  const oldNorm = normalizePath(oldPath);
  const next: Record<string, boolean> = {};
  for (const [path, open] of Object.entries(expanded)) {
    const norm = normalizePath(path);
    if (norm === oldNorm) {
      next[newPath] = open;
    } else if (norm.startsWith(oldNorm + "/")) {
      next[`${newPath}${path.slice(oldPath.length)}`] = open;
    } else {
      next[path] = open;
    }
  }
  return next;
}

function pathIsUnder(path: string, root: string): boolean {
  const value = normalizePath(path);
  const parent = normalizePath(root);
  return value === parent || value.startsWith(parent + "/");
}

function eventVisible(event: FsEvent, settings: AppSettings): boolean {
  const name = basename(event.path);
  if (!settings.files.show_hidden_files && name.startsWith(".")) return false;
  if (
    settings.files.exclude_patterns.some(
      (pattern) => normalizePath(pattern) === normalizePath(name),
    )
  ) {
    return false;
  }
  if (event.is_directory) return true;
  const ext = name.includes(".")
    ? `.${name.split(".").pop()!.toLowerCase()}`
    : "";
  return settings.files.visible_extensions.some(
    (allowed) => allowed.toLowerCase() === ext,
  );
}

interface TreePatch {
  tree: TreeNode[];
  expanded: Record<string, boolean>;
  tabs?: Record<string, Tab>;
  banners?: Banner[];
}

function patchTreeEvent(state: AppStore, event: FsEvent): TreePatch | null {
  const workspace = state.workspace;
  if (!workspace) return null;
  const root = normalizePath(workspace);
  const parent = dirname(event.path);
  const parentVisible =
    normalizePath(parent) === root || !!state.expanded[parent];

  if (event.type === "created") {
    if (!parentVisible) {
      return { tree: state.tree, expanded: state.expanded };
    }
    if (!eventVisible(event, state.settings)) {
      return { tree: state.tree, expanded: state.expanded };
    }
    const node: TreeNode = {
      name: basename(event.path),
      path: event.path,
      type: event.is_directory ? "folder" : "file",
      ...(event.is_directory ? { children: [] } : {}),
    };
    const result = insertTreeNode(
      state.tree,
      parent,
      node,
      state.settings.files.folders_first,
    );
    return result.inserted
      ? { tree: result.tree, expanded: state.expanded }
      : null;
  }

  if (event.type === "deleted") {
    const result = removeTreeNode(state.tree, event.path);
    if (!result.removed) {
      return parentVisible
        ? null
        : { tree: state.tree, expanded: state.expanded };
    }
    const expanded = Object.fromEntries(
      Object.entries(state.expanded).filter(
        ([path]) => !pathIsUnder(path, event.path),
      ),
    );
    const affected = Object.values(state.tabs).filter(
      (tab) => tab.path && pathIsUnder(tab.path, event.path),
    );
    const banners =
      affected.length > 0
        ? [
            ...state.banners.filter(
              (banner) => !affected.some((tab) => tab.id === banner.tabId),
            ),
            ...affected.map((tab) => ({
              id: `${tab.id}_${Date.now()}`,
              message: `${tab.filename} was removed on disk.`,
              tabId: tab.id,
              path: tab.path!,
            })),
          ]
        : state.banners;
    return { tree: result.tree, expanded, banners };
  }

  if (event.type === "moved") {
    const oldPath = event.old_path;
    if (!oldPath) return null;
    const result = removeTreeNode(state.tree, oldPath);
    if (!result.removed) return null;
    const node = rebaseNode(result.removed, oldPath, event.path);
    const expanded = rebaseExpanded(state.expanded, oldPath, event.path);
    const newParent = dirname(event.path);
    const newParentVisible =
      normalizePath(newParent) === root || !!state.expanded[newParent];

    let tree = result.tree;
    if (newParentVisible && eventVisible(event, state.settings)) {
      const inserted = insertTreeNode(
        tree,
        newParent,
        node,
        state.settings.files.folders_first,
      );
      if (!inserted.inserted) return null;
      tree = inserted.tree;
    }

    const tabs = Object.fromEntries(
      Object.entries(state.tabs).map(([id, tab]) => {
        if (!tab.path || !pathIsUnder(tab.path, oldPath)) {
          return [id, tab];
        }
        const nextPath = `${event.path}${tab.path.slice(oldPath.length)}`;
        return [id, { ...tab, path: nextPath, filename: basename(nextPath) }];
      }),
    );
    return { tree, expanded, tabs };
  }

  return null;
}

export interface SessionBuild {
  payload: Record<string, unknown>;
  dirtyIds: string[];
  metaHash: string;
}

export interface SaveAsState {
  tabId: string;
  path: string;
  filename: string;
  encoding: string;
  bom: boolean;
  lineEnding: LineEnding;
}

let saveAsResolve: ((value: boolean) => void) | null = null;

function settleSaveAs(value: boolean) {
  saveAsResolve?.(value);
  saveAsResolve = null;
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
  recentFiles: string[];
  closedTabs: Tab[];
  quickOpenMode: "files" | "recent";

  headings: Heading[];
  banners: Banner[];

  saveAs: SaveAsState | null;
  exportOpen: boolean;
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
  saveAll: () => Promise<{ saved: number; failed: string | null }>;
  reopenClosedTab: () => Promise<boolean>;
  refreshRecent: () => Promise<void>;
  markModified: (id: string) => void;
  setTabFormat: (
    id: string,
    patch: { encoding?: string; bom?: boolean; lineEnding?: LineEnding },
  ) => void;
  beginSaveAs: (id?: string) => Promise<boolean>;
  confirmSaveAs: (options: {
    encoding: string;
    bom: boolean;
    lineEnding: LineEnding;
  }) => Promise<boolean>;
  cancelSaveAs: () => void;
  snapshotActive: () => void;
  replaceTabContent: (id: string, content: string, markClean?: boolean) => void;

  openPath: (
    path: string,
    isPreview?: boolean,
    basePath?: string,
  ) => Promise<void>;
  openFileDialog: () => Promise<void>;
  openFileData: (data: FileData, isPreview?: boolean) => Tab | null;
  openFolder: () => Promise<void>;
  loadFolder: (path: string) => Promise<boolean>;
  refreshTree: () => Promise<void>;
  toggleFolder: (path: string) => Promise<void>;
  revealActiveInTree: (path: string) => Promise<void>;

  setViewMode: (mode: ViewMode) => void;
  showSingleView: (view: SingleView) => void;
  showEditorView: () => void;
  toggleSidebar: () => void;
  togglePreview: () => void;
  toggleTheme: () => void;
  setSidebarWidth: (width: number) => void;
  toggleZen: () => Promise<void>;

  updateSettings: (patch: Record<string, unknown>) => Promise<void>;
  refreshHeadings: () => void;

  handleFsEvent: (event: FsEvent) => Promise<void>;
  dismissBanner: (id: string) => void;
  reloadTab: (id: string, force?: boolean) => Promise<void>;

  buildSession: () => SessionBuild;
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
  recentFiles: [],
  closedTabs: [],
  quickOpenMode: "files",

  headings: [],
  banners: [],

  saveAs: null,
  exportOpen: false,
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
      if (loaded)
        settings = sanitizeSettings(deepMerge(DEFAULT_SETTINGS, loaded));
    } catch (error) {
      console.error("Failed to load settings", error);
    }
    settings = {
      ...settings,
      files: {
        ...settings.files,
        default_encoding: normalizeEncodingLabel(
          settings.files.default_encoding,
        ),
        default_line_ending: normalizeLineEnding(
          settings.files.default_line_ending,
        ),
      },
    };

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
              content: normalizeNewlines(data.content ?? ""),
              modified: data.modified ?? false,
              cursorPos: data.cursor_pos ?? 0,
              scrollTop: data.scroll_top ?? 0,
              isPreview: false,
              encoding: data.encoding ?? "UTF-8",
              bom: data.bom ?? defaultBom(data.encoding ?? "UTF-8"),
              lineEnding: normalizeLineEnding(data.line_ending),
              mixedLineEndings: data.mixed_line_endings ?? false,
              diskModifiedMs: data.disk_modified_ms ?? undefined,
            };
            order.push(id);
            tabRevisions.set(id, 0);
            if (data.modified) {
              backedUpRevisions.delete(id);
            } else {
              // Clean tabs came from disk; there is no backup to rewrite on
              // the first session save.
              backedUpRevisions.set(id, 0);
            }
          }

          // `load_session` already restored workspace trust and started the
          // watcher, and it returns the scanned tree. Reusing that tree avoids
          // a second full scan of the workspace at startup.
          if (session.workspace_folder && session.tree) {
            set({
              workspace: session.workspace_folder,
              tree: session.tree,
              showWelcome: false,
            });
            restored = true;
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
        const [folders, files] = await Promise.all([
          api.getRecentFolders(),
          api.getRecentFiles(),
        ]);
        set({
          recentFolders: folders ?? [],
          recentFiles: files ?? [],
          showWelcome: true,
        });
      } catch {
        /* ignore */
      }
      // Deliberately start with no tab: the sidebar welcome and the editor
      // empty state carry the first-run experience instead of a blank file.
    }

    set({ ready: true });
    get().refreshHeadings();
    void get().refreshRecent();

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
    const fileSettings = get().settings.files;
    const encoding =
      opts.encoding ?? normalizeEncodingLabel(fileSettings.default_encoding);
    const tab: Tab = {
      id,
      path: opts.path ?? null,
      filename: opts.filename ?? "Untitled",
      content: normalizeNewlines(opts.content ?? ""),
      modified: opts.modified ?? false,
      cursorPos: opts.cursorPos ?? 0,
      scrollTop: opts.scrollTop ?? 0,
      isPreview: opts.isPreview ?? false,
      encoding,
      bom: opts.bom ?? defaultBom(encoding),
      lineEnding:
        opts.lineEnding ??
        normalizeLineEnding(fileSettings.default_line_ending),
      mixedLineEndings: opts.mixedLineEndings ?? false,
      diskModifiedMs: opts.diskModifiedMs,
    };
    tabRevisions.set(id, 0);
    backedUpRevisions.delete(id);
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
    if (state.saveAs?.tabId === id) get().cancelSaveAs();
    state.snapshotActive();

    const closed = get().tabs[id];
    if (closed && !closed.isPreview) {
      set((current) => ({
        closedTabs: trimClosedTabs([...current.closedTabs, closed]),
      }));
    }

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

    tabRevisions.delete(id);
    backedUpRevisions.delete(id);
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
      const path = tab.path;
      const write = (expectedModifiedMs?: number | null) =>
        api.saveFile(
          path,
          content,
          tab.encoding,
          tab.bom,
          tab.lineEnding,
          expectedModifiedMs === null
            ? undefined
            : (expectedModifiedMs ?? get().tabs[id]?.diskModifiedMs),
        );
      try {
        let result = await serializeFileSave(() => write());

        if (result?.error === "conflict") {
          const choice = await toast.choose(
            `"${tab.filename}" changed on disk since it was opened. Overwrite it with the editor version?`,
            {
              saveText: "Overwrite",
              discardText: "Reload from disk",
              cancelText: "Cancel",
            },
          );
          if (choice === "cancel") return false;
          if (choice === "discard") {
            await get().reloadTab(id, true);
            return false;
          }
          result = await serializeFileSave(() => write(null));
        } else if (result?.error === "missing") {
          const recreate = await toast.confirm(
            `"${tab.filename}" was removed on disk. Save the editor version and recreate it?`,
            { confirmText: "Recreate", cancelText: "Cancel" },
          );
          if (!recreate) return false;
          result = await serializeFileSave(() => write(null));
        }

        if (result?.success) {
          set((state) => ({
            tabs: {
              ...state.tabs,
              [id]: {
                ...state.tabs[id],
                content,
                modified: false,
                mixedLineEndings: false,
                encoding: result.encoding ?? state.tabs[id].encoding,
                bom: result.bom ?? state.tabs[id].bom,
                lineEnding: result.line_ending ?? state.tabs[id].lineEnding,
                diskModifiedMs:
                  result.modified_ms ?? state.tabs[id].diskModifiedMs,
              },
            },
          }));
          toast.show(`Saved ${tab.filename}`, {
            type: "success",
            duration: 1500,
          });
          void get().refreshRecent();
          return true;
        }
        toast.show(result?.message ?? result?.error ?? "Save failed", {
          type: "error",
        });
      } catch (error) {
        toast.show(`Save failed: ${String(error)}`, { type: "error" });
      }
      return false;
    }

    return get().beginSaveAs(id);
  },

  saveActive: async () => {
    const id = get().activeId;
    if (!id) return false;
    return get().saveTab(id);
  },

  saveAll: async () => {
    if (saveAllRunning) return { saved: 0, failed: null };
    const ids = get().order.filter((id) => get().tabs[id]?.modified);
    if (ids.length === 0) {
      toast.show("Nothing to save", { type: "info", duration: 1200 });
      return { saved: 0, failed: null };
    }

    saveAllRunning = true;
    let saved = 0;
    let failed: string | null = null;
    try {
      for (const id of ids) {
        const tab = get().tabs[id];
        if (!tab) continue;
        const ok = await get().saveTab(id);
        if (!ok) {
          failed = tab.filename;
          break;
        }
        saved += 1;
      }
    } finally {
      saveAllRunning = false;
    }

    if (failed) {
      toast.show(`Saved ${saved} file(s). ${failed} failed.`, {
        type: "error",
        duration: 5000,
      });
    } else {
      toast.show(`Saved ${saved} file${saved === 1 ? "" : "s"}`, {
        type: "success",
        duration: 1500,
      });
    }
    return { saved, failed };
  },

  reopenClosedTab: async () => {
    const stack = get().closedTabs;
    if (stack.length === 0) {
      toast.show("No recently closed tabs", { type: "info", duration: 1200 });
      return false;
    }
    const entry = stack[stack.length - 1];
    set({ closedTabs: stack.slice(0, -1) });

    if (entry.path) {
      const existing = Object.values(get().tabs).find(
        (tab) =>
          tab.path && normalizePath(tab.path) === normalizePath(entry.path!),
      );
      if (existing) {
        get().activate(existing.id);
        return true;
      }
    }

    let missing = false;
    if (entry.path && !entry.modified) {
      try {
        const data = await api.openFileByPath(entry.path);
        if (data && !data.error) {
          get().createTab({
            path: data.path ?? entry.path,
            filename: data.filename ?? entry.filename,
            content: data.content ?? entry.content,
            modified: false,
            cursorPos: Math.min(entry.cursorPos, data.content?.length ?? 0),
            scrollTop: 0,
            encoding: data.encoding ?? entry.encoding,
            bom: data.bom ?? entry.bom,
            lineEnding: data.line_ending ?? entry.lineEnding,
            mixedLineEndings: data.mixed_line_endings ?? false,
            diskModifiedMs: data.modified_ms ?? undefined,
          });
          toast.show(`Reopened ${entry.filename}`, {
            type: "success",
            duration: 1200,
          });
          return true;
        }
        missing = true;
      } catch {
        missing = true;
      }
    }

    get().createTab({
      ...entry,
      id: undefined,
      modified: entry.modified || !entry.path || missing,
      isPreview: false,
    });
    toast.show(
      entry.modified || !entry.path || missing
        ? `Restored buffer for ${entry.filename}`
        : `Reopened ${entry.filename}`,
      { type: "info", duration: 1500 },
    );
    return true;
  },

  refreshRecent: async () => {
    try {
      const files = await api.getRecentFiles();
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const file of files ?? []) {
        const key = normalizePath(file);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(file);
      }
      set({ recentFiles: unique });
    } catch {
      /* recent files are best-effort */
    }
  },

  markModified: (id) => {
    const tab = get().tabs[id];
    if (!tab) return;
    tabRevisions.set(id, (tabRevisions.get(id) ?? 0) + 1);
    if (tab.modified) return;
    set((state) => ({
      tabs: { ...state.tabs, [id]: { ...state.tabs[id], modified: true } },
    }));
  },

  setTabFormat: (id, patch) => {
    const tab = get().tabs[id];
    if (!tab) return;
    tabRevisions.set(id, (tabRevisions.get(id) ?? 0) + 1);
    set((state) => ({
      tabs: {
        ...state.tabs,
        [id]: {
          ...state.tabs[id],
          ...patch,
          mixedLineEndings: patch.lineEnding
            ? false
            : state.tabs[id].mixedLineEndings,
          modified: true,
        },
      },
    }));
  },

  beginSaveAs: async (id) => {
    const state = get();
    const tabId = id ?? state.activeId;
    if (!tabId || state.saveAs) return false;
    const tab = state.tabs[tabId];
    if (!tab) return false;

    const suggested = /\.[a-z0-9]{1,8}$/i.test(tab.filename)
      ? tab.filename
      : `${tab.filename}.md`;
    const path = await pickSavePath(suggested);
    if (!path) return false;

    set({
      saveAs: {
        tabId,
        path,
        filename: basename(path),
        encoding: tab.encoding,
        bom: tab.bom,
        lineEnding: tab.lineEnding,
      },
    });
    return new Promise<boolean>((resolve) => {
      saveAsResolve = resolve;
    });
  },

  confirmSaveAs: async ({ encoding, bom, lineEnding }) => {
    const state = get();
    const pending = state.saveAs;
    if (!pending) return false;
    const tab = state.tabs[pending.tabId];
    if (!tab) {
      get().cancelSaveAs();
      return false;
    }

    const content =
      state.activeId === pending.tabId ? currentEditorContent() : tab.content;
    try {
      const result = await serializeFileSave(() =>
        api.saveFileAs(pending.path, content, encoding, bom, lineEnding),
      );
      if (!result?.success) {
        toast.show(result?.message ?? result?.error ?? "Save failed", {
          type: "error",
        });
        return false;
      }

      tabRevisions.set(
        pending.tabId,
        (tabRevisions.get(pending.tabId) ?? 0) + 1,
      );
      set((current) => ({
        saveAs: null,
        tabs: {
          ...current.tabs,
          [pending.tabId]: {
            ...current.tabs[pending.tabId],
            path: result.path ?? pending.path,
            filename: basename(result.path ?? pending.path),
            content,
            modified: false,
            mixedLineEndings: false,
            encoding: result.encoding ?? encoding,
            bom: result.bom ?? bom,
            lineEnding: result.line_ending ?? lineEnding,
            diskModifiedMs:
              result.modified_ms ?? current.tabs[pending.tabId]?.diskModifiedMs,
          },
        },
      }));
      settleSaveAs(true);
      toast.show(`Saved ${basename(result.path ?? pending.path)}`, {
        type: "success",
        duration: 1500,
      });
      void get().refreshRecent();
      await get().refreshTree();
      return true;
    } catch (error) {
      toast.show(`Save failed: ${String(error)}`, { type: "error" });
      return false;
    }
  },

  cancelSaveAs: () => {
    if (!get().saveAs) return;
    set({ saveAs: null });
    settleSaveAs(false);
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
    const normalized = normalizeNewlines(content);
    tabRevisions.set(id, (tabRevisions.get(id) ?? 0) + 1);
    set((state) => ({
      tabs: {
        ...state.tabs,
        [id]: {
          ...state.tabs[id],
          content: normalized,
          modified: markClean ? false : tab.modified,
        },
      },
    }));
    if (get().activeId === id) {
      editorRef.setDoc?.(normalized);
    }
    get().refreshHeadings();
  },

  openPath: async (path, isPreview = false, basePath) => {
    try {
      const data = basePath
        ? await api.openFileLink(basePath, path)
        : await api.openFileByPath(path);
      if (!data || data.error) {
        toast.show(data?.error ?? "Could not open file", { type: "error" });
        return;
      }
      get().openFileData(data, isPreview);
      void get().refreshRecent();
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
      // Re-opening a file that is already open must never replace an edited
      // buffer with the on-disk copy. Focus the tab and let the user decide
      // through the file-change banner / explicit reload instead.
      if (existing.modified) {
        get().activate(existing.id);
        toast.show(
          `"${existing.filename}" is already open with unsaved changes.`,
          { type: "warn", duration: 5000 },
        );
        return get().tabs[existing.id] ?? null;
      }

      const content = normalizeNewlines(data.content ?? existing.content);
      tabRevisions.set(existing.id, (tabRevisions.get(existing.id) ?? 0) + 1);
      set((current) => ({
        tabs: {
          ...current.tabs,
          [existing.id]: {
            ...current.tabs[existing.id],
            content,
            filename: data.filename ?? existing.filename,
            encoding: data.encoding ?? existing.encoding,
            bom: data.bom ?? existing.bom,
            lineEnding: data.line_ending ?? existing.lineEnding,
            mixedLineEndings:
              data.mixed_line_endings ??
              current.tabs[existing.id].mixedLineEndings,
            diskModifiedMs:
              data.modified_ms ?? current.tabs[existing.id].diskModifiedMs,
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
      encoding: data.encoding,
      bom: data.bom,
      lineEnding: data.line_ending,
      mixedLineEndings: data.mixed_line_endings,
      diskModifiedMs: data.modified_ms ?? undefined,
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
    const requestSeq = ++treeRequestSeq;
    try {
      const result = await api.openFolder(path);
      if (requestSeq !== treeRequestSeq) return false;
      if (!result || result.error) {
        toast.show(result?.error ?? "Could not open folder", {
          type: "error",
        });
        return false;
      }
      set({
        workspace: result.path,
        tree: result.tree ?? [],
        expanded: {},
        showWelcome: false,
      });
      treeErrorShown = false;
      return true;
    } catch (error) {
      if (requestSeq === treeRequestSeq) {
        toast.show(`Could not open folder: ${String(error)}`, {
          type: "error",
        });
      }
      return false;
    }
  },

  refreshTree: async () => {
    const state = get();
    const workspace = state.workspace;
    if (!workspace) return;
    const requestSeq = ++treeRequestSeq;
    const expandedPaths = Object.entries(state.expanded)
      .filter(([, open]) => open)
      .map(([path]) => path);
    try {
      const result = await api.getFolderTree(workspace, expandedPaths);
      if (requestSeq !== treeRequestSeq || get().workspace !== workspace) {
        return;
      }
      if (!result || result.error) {
        if (!treeErrorShown) {
          treeErrorShown = true;
          toast.show(result?.error ?? "Could not refresh the folder tree", {
            type: "error",
          });
        }
        return;
      }
      treeErrorShown = false;
      const tree = result.tree ?? [];
      set({ tree, expanded: pruneExpanded(tree, get().expanded) });
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
        if (!Array.isArray(children)) {
          toast.show(children?.error ?? "Could not load the folder contents", {
            type: "error",
          });
          return;
        }
        set((current) => ({
          tree: mapNode(current.tree, path, (item) => ({
            ...item,
            children,
          })),
        }));
      } catch (error) {
        toast.show(`Could not load the folder: ${String(error)}`, {
          type: "error",
        });
        return;
      }
    }
    set((current) => ({ expanded: { ...current.expanded, [path]: true } }));
  },

  revealActiveInTree: async (path) => {
    const { workspace, expanded } = get();
    if (!workspace) return;
    const root = normalizePath(workspace).replace(/\/+$/, "");
    const target = normalizePath(path);
    if (!target.startsWith(`${root}/`)) return;
    // Keep the original on-disk case for `expanded` keys: the Rust scanner
    // compares them case-sensitively against display paths from read_dir.
    const original = path.replace(/\\/g, "/");
    const originalRoot = workspace.replace(/\\/g, "/").replace(/\/+$/, "");
    const parts = original.slice(originalRoot.length + 1).split("/");
    parts.pop();
    const next = { ...expanded };
    let cursor = originalRoot;
    for (const part of parts) {
      cursor = `${cursor}/${part}`;
      next[cursor] = true;
      next[cursor.replace(/\//g, "\\")] = true;
    }
    set({ expanded: next });
    // The expanded set only tells the backend which branches to scan; the
    // children are not in the tree until a scoped refresh completes.
    await get().refreshTree();
    window.setTimeout(() => {
      const targetNode = Array.from(
        document.querySelectorAll<HTMLElement>("[data-tree-path]"),
      ).find(
        (element) => normalizePath(element.dataset.treePath ?? "") === target,
      );
      targetNode?.scrollIntoView({ block: "nearest" });
    }, 0);
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
    set((state) => ({
      sidebarVisible: next,
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, sidebar_visible: next },
      },
    }));
    void persistSettings({ appearance: { sidebar_visible: next } });
  },

  togglePreview: () => {
    if (get().viewMode === "single") {
      set({
        singleView: get().singleView === "preview" ? "editor" : "preview",
      });
    } else {
      const next = !get().previewVisible;
      set((state) => ({
        previewVisible: next,
        settings: {
          ...state.settings,
          appearance: { ...state.settings.appearance, preview_visible: next },
        },
      }));
      void persistSettings({ appearance: { preview_visible: next } });
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
    void persistSettings({ appearance: { theme } });
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
    const merged = sanitizeSettings(deepMerge(get().settings, patch));
    const appearancePatch = (patch as { appearance?: Record<string, unknown> })
      .appearance;
    set({
      settings: merged,
      theme: merged.appearance.theme,
      // Only apply layout fields that this patch actually changed. Otherwise an
      // unrelated settings edit would reset a transient collapsed sidebar or
      // hidden preview back to the values captured at mount time.
      ...(appearancePatch && "sidebar_visible" in appearancePatch
        ? { sidebarVisible: merged.appearance.sidebar_visible !== false }
        : {}),
      ...(appearancePatch && "preview_visible" in appearancePatch
        ? { previewVisible: merged.appearance.preview_visible !== false }
        : {}),
      ...(appearancePatch && "sidebar_width" in appearancePatch
        ? { sidebarWidth: merged.appearance.sidebar_width || 250 }
        : {}),
    });

    const filesPatch = (patch as { files?: Record<string, unknown> }).files;
    if (
      filesPatch &&
      [
        "visible_extensions",
        "show_hidden_files",
        "exclude_patterns",
        "folders_first",
      ].some((key) => key in filesPatch)
    ) {
      // Refresh only after the patch has reached Rust; otherwise the scan
      // still sees the old extension/exclude settings.
      refreshTreeAfterSettings = true;
    }
    queueSettingsPersist(patch);

    if (filesPatch && "show_hidden_files" in filesPatch) {
      // The watcher reads show_hidden_files from Rust state, so persist the
      // patch before asking it to restart.
      void flushSettingsPersist()
        .then(() => api.restartWatcher())
        .catch(() => undefined);
    }
  },

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
      const patch = patchTreeEvent(state, event);
      if (patch) {
        set(patch);
      } else {
        // The event touched a branch that is not loaded; fall back to a
        // scoped refresh (coalesced across watcher batches).
        scheduleTreeRefresh(() => get().refreshTree());
      }
    }

    if (
      event.is_directory ||
      (event.type !== "modified" && event.type !== "deleted")
    ) {
      return;
    }

    const target = normalizePath(event.path);
    const affected = Object.values(state.tabs).filter(
      (tab) => tab.path && normalizePath(tab.path) === target,
    );
    for (const tab of affected) {
      const banner: Banner = {
        id: `${tab.id}_${Date.now()}`,
        message:
          event.type === "deleted"
            ? `${tab.filename} was removed on disk.`
            : `${tab.filename} changed on disk.`,
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

  reloadTab: async (id, force = false) => {
    const tab = get().tabs[id];
    if (!tab?.path) return;
    if (tab.modified && !force) {
      const proceed = await toast.confirm(
        `Reload "${tab.filename}" from disk and discard unsaved changes?`,
        { confirmText: "Reload", cancelText: "Cancel" },
      );
      if (!proceed) return;
    }
    try {
      const data = await api.openFileByPath(tab.path);
      if (data?.error) {
        toast.show(data.error, { type: "error" });
        return;
      }
      get().replaceTabContent(id, data.content ?? "", true);
      set((state) => ({
        tabs: {
          ...state.tabs,
          [id]: {
            ...state.tabs[id],
            encoding: data.encoding ?? state.tabs[id].encoding,
            bom: data.bom ?? state.tabs[id].bom,
            lineEnding: data.line_ending ?? state.tabs[id].lineEnding,
            mixedLineEndings:
              data.mixed_line_endings ?? state.tabs[id].mixedLineEndings,
            diskModifiedMs: data.modified_ms ?? state.tabs[id].diskModifiedMs,
          },
        },
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
    const dirtyIds: string[] = [];
    for (const [id, tab] of Object.entries(state.tabs)) {
      // Only trust the live editor text when the view actually holds this tab;
      // during start-up (and after remounts) the view may still be empty.
      const hydrated =
        state.activeId === id && state.editorTabId === id && !!editorRef.view;
      const revision = tabRevisions.get(id) ?? 0;
      const backedUp = backedUpRevisions.get(id) ?? -1;
      const dirty = revision !== backedUp;
      const entry: Record<string, unknown> = {
        path: tab.path,
        filename: tab.filename,
        cursor_pos: hydrated
          ? (editorRef.view?.state.selection.main.head ?? tab.cursorPos)
          : tab.cursorPos,
        scroll_top: hydrated
          ? (editorRef.view?.scrollDOM.scrollTop ?? tab.scrollTop)
          : tab.scrollTop,
        modified: tab.modified,
        encoding: tab.encoding,
        bom: tab.bom,
        line_ending: tab.lineEnding,
        disk_modified_ms: tab.diskModifiedMs ?? null,
      };
      if (dirty) {
        entry.content = hydrated ? currentEditorContent() : tab.content;
        dirtyIds.push(id);
      }
      tabs[id] = entry;
    }

    const metaHash = hashString(
      JSON.stringify({
        order: state.order,
        active: state.activeId,
        workspace: state.workspace,
        sidebarWidth: state.sidebarWidth,
        sidebarVisible: state.sidebarVisible,
        // Cursor/scroll/modified/format changes are session metadata too. If
        // they are omitted, save_merged's meta-hash fast path keeps writing
        // stale values until the document content changes.
        tabs: state.order.map((tabId) => {
          const entry = tabs[tabId] as Record<string, unknown> | undefined;
          return [
            tabId,
            entry?.path,
            entry?.filename,
            entry?.modified,
            entry?.cursor_pos,
            entry?.scroll_top,
            entry?.encoding,
            entry?.bom,
            entry?.line_ending,
            entry?.disk_modified_ms,
          ];
        }),
      }),
    );
    return {
      payload: {
        version: 2,
        meta_hash: metaHash,
        tabs,
        tab_order: state.order,
        active_tab: state.activeId,
        workspace_folder: state.workspace,
        sidebar_width: state.sidebarWidth,
        sidebar_collapsed: !state.sidebarVisible,
      },
      dirtyIds,
      metaHash,
    };
  },

  saveSession: () => {
    // Coalesce concurrent callers (interval, beforeunload, close handshake)
    // onto the same in-flight write instead of silently dropping the request.
    if (sessionSavePromise) return sessionSavePromise;
    const { payload, dirtyIds, metaHash } = get().buildSession();
    if (dirtyIds.length === 0 && metaHash === lastSavedMetaHash) {
      return Promise.resolve();
    }

    const revisions = new Map<string, number>();
    for (const id of dirtyIds) {
      revisions.set(id, tabRevisions.get(id) ?? 0);
    }

    const pending = (async () => {
      try {
        const ok = await api.saveSession(payload);
        if (!ok) return;
        for (const [id, revision] of revisions) {
          backedUpRevisions.set(id, revision);
        }
        lastSavedMetaHash = metaHash;
      } catch (error) {
        console.error("Failed to save session", error);
      } finally {
        sessionSavePromise = null;
      }
    })();
    sessionSavePromise = pending;
    return pending;
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
    return await pickFile();
  } catch (error) {
    console.error("File dialog failed", error);
    return null;
  }
}
