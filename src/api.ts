import { invoke } from "@tauri-apps/api/core";
import {
  open as openNative,
  save as saveNative,
} from "@tauri-apps/plugin-dialog";

import type {
  AppSettings,
  FileData,
  FileHit,
  FolderTree,
  OpResult,
  RenderResult,
  SearchHit,
  SearchOptions,
  SearchResponse,
  SessionData,
  TreeNode,
} from "./types";

const TEXT_FILTERS = [
  { name: "Markdown & Text", extensions: ["md", "markdown", "mdx", "txt"] },
  { name: "All Files", extensions: ["*"] },
];

export async function pickFolder(): Promise<string | null> {
  const result = await openNative({
    directory: true,
    multiple: false,
    title: "Open Folder",
  });
  return typeof result === "string" ? result : null;
}

export async function pickFile(): Promise<string | null> {
  const result = await openNative({
    multiple: false,
    title: "Open File",
    filters: TEXT_FILTERS,
  });
  return typeof result === "string" ? result : null;
}

export async function pickSavePath(
  defaultName: string,
): Promise<string | null> {
  const result = await saveNative({
    title: "Save File",
    defaultPath: defaultName,
    filters: TEXT_FILTERS,
  });
  return typeof result === "string" ? result : null;
}

export const api = {
  // Settings
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (data: Record<string, unknown>) =>
    invoke<boolean>("save_settings", { data }),
  restartWatcher: () => invoke<void>("restart_watcher"),
  setWindowTheme: (theme: string) =>
    invoke<void>("set_window_theme", { theme }),
  confirmClose: () => invoke<void>("confirm_close"),

  // Folders
  openFolder: (path: string) =>
    invoke<FolderTree>("open_folder_path", { path }),
  getFolderTree: (path: string, expanded: string[] = []) =>
    invoke<FolderTree>("get_folder_tree", { path, expanded }),
  getFolderChildren: (path: string) =>
    invoke<TreeNode[] | { error?: string }>("get_folder_children", { path }),
  createFile: (folder: string, name: string) =>
    invoke<OpResult>("create_file", { folder, name }),
  createFolder: (parent: string, name: string) =>
    invoke<OpResult>("create_folder", { parent, name }),
  renameItem: (oldPath: string, newName: string) =>
    invoke<OpResult>("rename_item", { oldPath, newName }),
  deleteItem: (path: string) => invoke<OpResult>("delete_item", { path }),
  duplicateFile: (path: string) => invoke<OpResult>("duplicate_file", { path }),
  moveItem: (src: string, destFolder: string) =>
    invoke<OpResult>("move_item", { src, destFolder }),
  searchFilenames: (query: string) =>
    invoke<FileHit[]>("search_filenames", { query }),

  // Files
  openFileByPath: (path: string) =>
    invoke<FileData>("open_file_path", { path }),
  openFileLink: (base: string, path: string) =>
    invoke<FileData>("open_file_link", { base, path }),
  fileMtimes: (paths: string[]) =>
    invoke<Record<string, { exists: boolean; modified_ms: number | null }>>(
      "file_mtimes",
      { paths },
    ),
  saveFile: (
    path: string,
    content: string,
    encoding?: string,
    bom?: boolean,
    lineEnding?: string,
    expectedModifiedMs?: number,
  ) =>
    invoke<OpResult>("save_file", {
      path,
      content,
      encoding,
      bom,
      lineEnding,
      expectedModifiedMs,
    }),
  saveFileAs: (
    path: string,
    content: string,
    encoding?: string,
    bom?: boolean,
    lineEnding?: string,
    remember = true,
  ) =>
    invoke<OpResult>("save_file_as", {
      path,
      content,
      encoding,
      bom,
      lineEnding,
      remember,
    }),
  getRecentFiles: () => invoke<string[]>("get_recent_files"),
  getRecentFolders: () => invoke<string[]>("get_recent_folders"),

  // Session
  saveSession: (data: Record<string, unknown>) =>
    invoke<boolean>("save_session", { data }),
  loadSession: () => invoke<SessionData | null>("load_session"),

  // Markdown
  renderMarkdown: (text: string) =>
    invoke<RenderResult>("render_markdown", { text }),

  // Images
  saveImage: (destFolder: string, filename: string, base64Data: string) =>
    invoke<OpResult>("save_image", { destFolder, filename, base64Data }),
  importImage: (source: string, folder: string) =>
    invoke<OpResult>("import_image", { source, folder }),

  // Misc
  revealInExplorer: (path: string) =>
    invoke<OpResult>("reveal_in_explorer", { path }),
  pathKind: (path: string) =>
    invoke<"file" | "directory" | "missing">("path_kind", { path }),
  takeLaunchFile: () => invoke<string | null>("take_launch_file"),
  registerFileAssociation: () => invoke<OpResult>("register_file_association"),
  unregisterFileAssociation: () =>
    invoke<OpResult>("unregister_file_association"),
  fileAssociationStatus: () => invoke<boolean>("file_association_status"),
  openDefaultAppsSettings: () => invoke<OpResult>("open_default_apps_settings"),

  // Search
  searchInFiles: (
    query: string,
    folder: string | null,
    options: SearchOptions,
    requestId: number,
  ) =>
    invoke<SearchResponse>("search_in_files", {
      requestId,
      query,
      folder,
      options,
    }),
  cancelSearch: () => invoke<void>("cancel_search"),
};
