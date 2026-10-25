import { useEffect, useRef, useState } from "react";
import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";

import { api } from "../api";
import { COPYRIGHT_HOLDER, COPYRIGHT_YEAR, LICENSE_NAME } from "../branding";
import { contextMenu, type MenuItem } from "../contextMenu";
import { editorRef } from "../editorRef";
import {
  IconApp,
  IconAppLight,
  IconChevronRight,
  IconFolder,
  IconLayers,
  IconRefresh,
  IconSearch,
} from "../icons";
import { promptText } from "../prompt";
import { useStore } from "../store";
import { toast } from "../toast";
import type { FileHit, TreeNode } from "../types";
import { useAppVersion } from "../useAppVersion";
import { basename, normalizePath, relativeTo } from "../utils";

const FOLDER_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>';

/** Two-to-four character tag shown instead of a generic document glyph. */
function fileBadge(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (!ext) return "TXT";
  if (ext === "markdown" || ext === "mdx") return "MD";
  return ext.slice(0, 4).toUpperCase();
}

function iconClass(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["md", "markdown", "mdx"].includes(ext)) return "file-md";
  if (["html", "htm"].includes(ext)) return "file-html";
  if (["doc", "docx"].includes(ext)) return "file-doc";
  if (["xls", "xlsx", "csv"].includes(ext)) return "file-xls";
  if (ext === "pdf") return "file-pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext))
    return "file-img";
  return "file-default";
}

const ALL_EXTENSIONS = [
  ".md",
  ".markdown",
  ".mdx",
  ".txt",
  ".html",
  ".htm",
  ".json",
  ".css",
  ".js",
  ".ts",
  ".py",
  ".xlsx",
  ".xls",
  ".docx",
  ".doc",
  ".pdf",
  ".pptx",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
];
const CORE_EXTENSIONS = [".md", ".markdown", ".mdx", ".txt"];

export function Sidebar() {
  const sidebarVisible = useStore((state) => state.sidebarVisible);
  const sidebarWidth = useStore((state) => state.sidebarWidth);
  const workspace = useStore((state) => state.workspace);
  const tree = useStore((state) => state.tree);
  const expanded = useStore((state) => state.expanded);
  const showWelcome = useStore((state) => state.showWelcome);
  const recentFolders = useStore((state) => state.recentFolders);
  const activeTabPath = useStore((state) =>
    state.activeId ? (state.tabs[state.activeId]?.path ?? null) : null,
  );
  const headings = useStore((state) => state.headings);
  const theme = useStore((state) => state.theme);
  const visibleExtensions = useStore(
    (state) => state.settings.files.visible_extensions,
  );
  const version = useAppVersion();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileHit[]>([]);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const searchTimer = useRef<number | undefined>(undefined);
  const welcomeShown = showWelcome && !workspace;

  const store = useStore.getState();
  const extraActive = visibleExtensions.length > CORE_EXTENSIONS.length;

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      try {
        const hits = await api.searchFilenames(query.trim());
        setResults(hits ?? []);
      } catch {
        setResults([]);
      }
    }, 150);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query]);

  if (!sidebarVisible) return null;

  const folderLabel = workspace
    ? (() => {
        const segments = workspace
          .replace(/\\/g, "/")
          .split("/")
          .filter(Boolean);
        const count =
          useStore.getState().settings.files.folder_label_segments || 2;
        return segments.slice(-count).join("/");
      })()
    : "No folder opened";

  const toggleExtraFiles = async () => {
    const next = extraActive ? CORE_EXTENSIONS : ALL_EXTENSIONS;
    await store.updateSettings({ files: { visible_extensions: next } });
    await store.refreshTree();
  };

  return (
    <div id="sidebar" style={{ width: sidebarWidth }}>
      <div id="sidebar-header" className={welcomeShown ? "hidden" : undefined}>
        <div className="sidebar-title-row">
          <span className="side-label">Explorer</span>
          <div className="side-actions">
            <button
              id="btn-search-files"
              className="icon-btn sm"
              title="Search in files (Ctrl+Shift+F)"
              onClick={() => useStore.setState({ searchFilesOpen: true })}
            >
              <IconSearch />
            </button>
            <button
              id="btn-toggle-extra-files"
              className={`icon-btn sm${extraActive ? " on" : ""}`}
              title="Show all file types"
              onClick={() => void toggleExtraFiles()}
            >
              <IconLayers />
            </button>
            <button
              id="btn-reload-folder"
              className="icon-btn sm"
              title="Reload folder"
              onClick={() => void store.refreshTree()}
            >
              <IconRefresh />
            </button>
          </div>
        </div>
        <div
          id="sidebar-folder-label"
          className="workspace-name"
          title={workspace ?? ""}
        >
          <IconFolder />
          <span>{folderLabel}</span>
        </div>
        <label className="side-search">
          <IconSearch />
          <input
            type="text"
            id="sidebar-search"
            placeholder="Filter files"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
          />
        </label>
      </div>

      <div id="file-tree" className={welcomeShown ? "hidden" : undefined}>
        {query.trim() ? (
          results.length === 0 ? (
            <div className="tree-empty">No matching files</div>
          ) : (
            results.map((hit) => (
              <div
                className={`tree-item${
                  activeTabPath &&
                  normalizePath(activeTabPath) === normalizePath(hit.path)
                    ? " active"
                    : ""
                }`}
                key={hit.path}
                title={hit.path}
                onClick={() => void store.openPath(hit.path, false)}
              >
                <span className="chevron" style={{ visibility: "hidden" }}>
                  <IconChevronRight />
                </span>
                <span className={`icon file-icon ${iconClass(hit.name)}`}>
                  {fileBadge(hit.name)}
                </span>
                <span className="name">{hit.name}</span>
                <span className="tree-hint">
                  {relativeTo(workspace ?? "", hit.path)}
                </span>
              </div>
            ))
          )
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              activePath={activeTabPath}
              draggingPath={draggingPath}
              onDragPath={setDraggingPath}
            />
          ))
        )}
      </div>

      <div id="sidebar-welcome" className={welcomeShown ? "" : "hidden"}>
        <div className="welcome-brand">
          <span className="welcome-mark" aria-hidden="true">
            {theme === "dark" ? <IconApp /> : <IconAppLight />}
          </span>
          <div className="welcome-brand-text">
            <div className="welcome-word">
              Mark<em>View</em>
            </div>
            <div className="welcome-tag">Markdown, considered.</div>
          </div>
        </div>

        <button id="btn-welcome-open" onClick={() => void store.openFolder()}>
          <IconFolder />
          <span>Open folder</span>
          <kbd className="mv-kbd">Ctrl Shift O</kbd>
        </button>
        <p className="welcome-hint">or drop a folder anywhere in this window</p>

        {recentFolders.length > 0 && (
          <div className="welcome-recent">
            <div className="welcome-sec-head">
              <span>Recent</span>
              <span className="welcome-sec-line" />
            </div>
            <div id="recent-folders-list">
              {recentFolders.map((folder) => (
                <div
                  className="recent-item"
                  key={folder}
                  title={folder}
                  onClick={() => void store.loadFolder(folder)}
                >
                  <span className="recent-icon">
                    <IconFolder />
                  </span>
                  <span className="recent-body">
                    <span className="recent-name">{basename(folder)}</span>
                    <span className="recent-path">{folder}</span>
                  </span>
                  <IconChevronRight className="recent-go" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="welcome-ghost" aria-hidden="true">
          Mark<em>View</em>
        </div>

        <div className="welcome-footer">
          <span className="welcome-foot-mark">©</span>
          <span>
            {COPYRIGHT_YEAR} <b>{COPYRIGHT_HOLDER}</b>
          </span>
          <span className="welcome-footer-dot" />
          <span>{LICENSE_NAME}</span>
          <span className="welcome-ver">v{version}</span>
        </div>
      </div>

      {headings.length > 0 && <Outline headings={headings} />}
    </div>
  );
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  activePath: string | null;
  draggingPath: string | null;
  onDragPath: (path: string | null) => void;
}

function TreeItem({
  node,
  depth,
  expanded,
  activePath,
  draggingPath,
  onDragPath,
}: TreeItemProps) {
  const store = useStore.getState();
  const isFolder = node.type === "folder";
  const isOpen = !!expanded[node.path];
  const isActive =
    !isFolder &&
    activePath &&
    normalizePath(activePath) === normalizePath(node.path);

  const commonMenu: MenuItem[] = isFolder
    ? [
        {
          label: "New File",
          action: async () => {
            const name = await promptText("New File", "untitled.md", "Create");
            if (!name) return;
            const result = await api.createFile(node.path, name);
            if (result?.error)
              return toast.show(result.error, { type: "error" });
            await store.refreshTree();
            if (result?.path) void store.openPath(result.path, false);
          },
        },
        {
          label: "New Folder",
          action: async () => {
            const name = await promptText("New Folder", "new-folder", "Create");
            if (!name) return;
            const result = await api.createFolder(node.path, name);
            if (result?.error)
              return toast.show(result.error, { type: "error" });
            await store.refreshTree();
          },
        },
        { separator: true },
        {
          label: "Rename",
          action: async () => {
            const name = await promptText("Rename", node.name, "Rename");
            if (!name || name === node.name) return;
            const result = await api.renameItem(node.path, name);
            if (result?.error)
              return toast.show(result.error, { type: "error" });
            await store.refreshTree();
          },
        },
        {
          label: "Delete",
          action: async () => {
            if (!(await confirmDelete(node.name))) return;
            const result = await api.deleteItem(node.path);
            if (result?.error)
              return toast.show(result.error, { type: "error" });
            await store.refreshTree();
          },
        },
        { separator: true },
        {
          label: "Reveal in Explorer",
          action: () => void api.revealInExplorer(node.path),
        },
        {
          label: "Copy Path",
          action: () => void navigator.clipboard.writeText(node.path),
        },
      ]
    : [
        { label: "Open", action: () => void store.openPath(node.path, false) },
        {
          label: "Open as Preview",
          action: () => void store.openPath(node.path, true),
        },
        { separator: true },
        {
          label: "New Folder",
          action: async () => {
            const dir = node.path.replace(/[\\/][^\\/]*$/, "");
            const name = await promptText("New Folder", "new-folder", "Create");
            if (!name) return;
            const result = await api.createFolder(dir, name);
            if (result?.error)
              return toast.show(result.error, { type: "error" });
            await store.refreshTree();
          },
        },
        {
          label: "Rename",
          action: async () => {
            const name = await promptText("Rename", node.name, "Rename");
            if (!name || name === node.name) return;
            const result = await api.renameItem(node.path, name);
            if (result?.error)
              return toast.show(result.error, { type: "error" });
            await store.refreshTree();
          },
        },
        {
          label: "Duplicate",
          action: async () => {
            const result = await api.duplicateFile(node.path);
            if (result?.error)
              return toast.show(result.error, { type: "error" });
            await store.refreshTree();
          },
        },
        {
          label: "Delete",
          action: async () => {
            if (!(await confirmDelete(node.name))) return;
            const result = await api.deleteItem(node.path);
            if (result?.error)
              return toast.show(result.error, { type: "error" });
            await store.refreshTree();
          },
        },
        { separator: true },
        {
          label: "Reveal in Explorer",
          action: () => void api.revealInExplorer(node.path),
        },
        {
          label: "Copy Path",
          action: () => void navigator.clipboard.writeText(node.path),
        },
        {
          label: "Copy Relative Path",
          action: () => {
            const root = useStore.getState().workspace ?? "";
            void navigator.clipboard.writeText(relativeTo(root, node.path));
          },
        },
      ];

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isFolder) return;
    const source = draggingPath;
    onDragPath(null);
    if (!source || source === node.path) return;
    if (normalizePath(node.path).startsWith(normalizePath(source) + "/"))
      return;
    const result = await api.moveItem(source, node.path);
    if (result?.error) {
      toast.show(result.error, { type: "error" });
      return;
    }
    await store.refreshTree();
  };

  return (
    <>
      <div
        className={`tree-item${isActive ? " active" : ""}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        title={node.path}
        draggable
        onDragStart={(event) => {
          onDragPath(node.path);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => onDragPath(null)}
        onDragOver={(event) => {
          if (isFolder) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => void onDrop(event)}
        onClick={() => {
          if (isFolder) {
            void store.toggleFolder(node.path);
          } else {
            void store.openPath(node.path, false);
          }
        }}
        onDoubleClick={() => {
          if (isFolder) return;
          const opensPreview =
            useStore.getState().settings.preview.double_click_preview;
          if (opensPreview) void store.openPath(node.path, true);
        }}
        onContextMenu={(event: ReactMouseEvent) => {
          contextMenu.show(event, commonMenu);
        }}
      >
        <span
          className={`chevron${isOpen ? " expanded" : ""}`}
          style={{ visibility: isFolder ? "visible" : "hidden" }}
        >
          <IconChevronRight />
        </span>
        {isFolder ? (
          <span
            className="icon folder-icon"
            dangerouslySetInnerHTML={{ __html: FOLDER_SVG }}
          />
        ) : (
          <span className={`icon file-icon ${iconClass(node.name)}`}>
            {fileBadge(node.name)}
          </span>
        )}
        <span className="name">{node.name}</span>
      </div>
      {isFolder && node.children && node.children.length > 0 && (
        <div className={`tree-children${isOpen ? "" : " collapsed"}`}>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              activePath={activePath}
              draggingPath={draggingPath}
              onDragPath={onDragPath}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Outline({
  headings,
}: {
  headings: { level: number; text: string; line: number }[];
}) {
  const [visible, setVisible] = useState(true);
  return (
    <div id="document-outline">
      <div className="outline-header">
        <span className="outline-title">Outline</span>
        <button
          className="outline-toggle"
          title="Toggle outline"
          onClick={() => setVisible(!visible)}
        >
          <IconChevronRight
            style={{ transform: visible ? "rotate(90deg)" : "none" }}
          />
        </button>
      </div>
      <div className={`outline-items${visible ? "" : " collapsed"}`}>
        {headings.map((heading, index) => (
          <div
            key={`${heading.line}-${index}`}
            className={`outline-item outline-h${heading.level}`}
            title={heading.text}
            onClick={() => editorRef.scrollToLine?.(heading.line + 1)}
          >
            <span className="o-level">H{heading.level}</span>
            <span className="o-text">{heading.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

async function confirmDelete(name: string): Promise<boolean> {
  return toast.confirm(`Move "${name}" to the Recycle Bin?`, {
    confirmText: "Delete",
    cancelText: "Cancel",
  });
}
