export type Theme = "dark" | "light";
export type ViewMode = "single" | "split";
export type SingleView = "editor" | "preview";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
  modified?: string;
  size?: number;
}

export interface FolderTree {
  path: string;
  tree: TreeNode[];
}

export interface FileData {
  content?: string;
  encoding?: string;
  size?: number;
  path?: string;
  filename?: string;
  error?: string;
}

export interface OpResult {
  success?: boolean;
  error?: string;
  path?: string;
  name?: string;
  old_path?: string;
  new_path?: string;
}

export interface Tab {
  id: string;
  path: string | null;
  filename: string;
  content: string;
  modified: boolean;
  cursorPos: number;
  scrollTop: number;
  isPreview: boolean;
  encoding: string;
}

export interface SearchHit {
  file: string;
  filename: string;
  line: number;
  text: string;
}

export interface FileHit {
  name: string;
  path: string;
  relative: string;
}

export interface FsEvent {
  type: "created" | "modified" | "deleted" | "moved";
  path: string;
  is_directory: boolean;
}

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export interface Banner {
  id: string;
  message: string;
  tabId: string;
  path: string;
}

export interface AppearanceSettings {
  theme: Theme;
  font_family_editor: string;
  font_family_preview: string;
  font_size_editor: number;
  font_size_preview: number;
  zoom_level: number;
  zoom_enabled: boolean;
  sidebar_width: number;
  sidebar_visible: boolean;
  preview_visible: boolean;
  preview_position: string;
  show_toolbar: boolean;
  show_statusbar: boolean;
  show_line_numbers: boolean;
  show_minimap: boolean;
}

export interface EditorSettings {
  word_wrap: boolean;
  tab_size: number;
  insert_spaces: boolean;
  auto_close_brackets: boolean;
  auto_indent: boolean;
  highlight_active_line: boolean;
  match_brackets: boolean;
  code_folding: boolean;
}

export interface FilesSettings {
  auto_save: boolean;
  auto_save_interval: number;
  default_encoding: string;
  default_line_ending: string;
  visible_extensions: string[];
  show_hidden_files: boolean;
  sort_by: string;
  folders_first: boolean;
  folder_label_segments: number;
  exclude_patterns: string[];
}

export interface SessionSettings {
  restore_session: boolean;
  backup_interval: number;
  remember_folder: boolean;
}

export interface PreviewSettings {
  scroll_sync: boolean;
  render_mermaid: boolean;
  render_math: boolean;
  double_click_preview: boolean;
  code_theme: string;
}

export interface AppSettings {
  appearance: AppearanceSettings;
  editor: EditorSettings;
  files: FilesSettings;
  preview: PreviewSettings;
  session: SessionSettings;
  recent_files: string[];
  recent_folders: string[];
  language: string;
  [key: string]: unknown;
}

export interface SearchOptions {
  case_sensitive: boolean;
  whole_word: boolean;
  regex: boolean;
  include: string;
  exclude: string;
}

export interface RenderResult {
  html: string;
  toc: string;
}

export interface SessionTab {
  path: string | null;
  filename: string;
  content: string;
  cursor_pos: number;
  scroll_top: number;
  modified: boolean;
}

export interface SessionData {
  tabs: Record<string, SessionTab>;
  tab_order: string[];
  active_tab: string | null;
  workspace_folder?: string | null;
  tree?: TreeNode[] | null;
}
