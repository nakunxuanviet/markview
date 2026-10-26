import {
  IconApp,
  IconAppLight,
  IconCommand,
  IconFolder,
  IconMoon,
  IconNewFile,
  IconOpenFile,
  IconOpenFolder,
  IconSearch,
  IconSettings,
  IconSidebar,
  IconSun,
} from "../icons";
import { useStore } from "../store";
import { basename } from "../utils";

export function AppBar() {
  const theme = useStore((state) => state.theme);
  const workspace = useStore((state) => state.workspace);
  const activeId = useStore((state) => state.activeId);
  const tabs = useStore((state) => state.tabs);
  const viewMode = useStore((state) => state.viewMode);
  const singleView = useStore((state) => state.singleView);
  const sidebarVisible = useStore((state) => state.sidebarVisible);

  const active = activeId ? tabs[activeId] : undefined;
  const store = useStore.getState();

  const isWrite = viewMode === "single" && singleView === "editor";
  const isRead = viewMode === "single" && singleView === "preview";
  const isSplit = viewMode === "split";

  return (
    <header id="app-bar">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          {theme === "dark" ? <IconApp /> : <IconAppLight />}
        </span>
        <span className="brand-name">
          Mark<em>View</em>
        </span>
      </div>

      <div className="appbar-group">
        <button
          id="btn-new-file"
          className="icon-btn"
          title="New file (Ctrl+N)"
          onClick={() => store.createTab()}
        >
          <IconNewFile />
        </button>
        <button
          id="btn-open-file"
          className="icon-btn"
          title="Open file (Ctrl+O)"
          onClick={() => void store.openFileDialog()}
        >
          <IconOpenFile />
        </button>
        <button
          id="btn-open-folder"
          className="icon-btn"
          title="Open folder (Ctrl+Shift+O)"
          onClick={() => void store.openFolder()}
        >
          <IconOpenFolder />
        </button>
      </div>

      <span className="bar-sep" />

      <button
        id="btn-toggle-sidebar"
        className={`icon-btn${sidebarVisible ? " on" : ""}`}
        title="Toggle sidebar (Ctrl+\\)"
        onClick={() => store.toggleSidebar()}
      >
        <IconSidebar />
      </button>

      <div className="crumb" title={active?.path ?? workspace ?? undefined}>
        <span className="crumb-folder">
          <IconFolder />
          <span>{workspace ? basename(workspace) : "No folder"}</span>
        </span>
        <span className="crumb-slash">/</span>
        <span className="crumb-file">{active?.filename ?? "Untitled"}</span>
      </div>

      <div className="appbar-spacer" />

      <button
        className="search-pill"
        title="Quick open (Ctrl+P)"
        onClick={() => useStore.setState({ quickOpenOpen: true })}
      >
        <IconSearch />
        <span>Search files</span>
        <kbd>Ctrl P</kbd>
      </button>

      <button
        className="icon-btn"
        title="Command palette (Ctrl+Shift+P)"
        onClick={() => useStore.setState({ paletteOpen: true })}
      >
        <IconCommand />
      </button>

      <div className="view-seg" role="group" aria-label="View mode">
        <button
          className={isWrite ? "on" : ""}
          title="Write only"
          onClick={() => store.showSingleView("editor")}
        >
          Write
        </button>
        <button
          className={isSplit ? "on" : ""}
          title="Split editor and preview"
          onClick={() => store.setViewMode("split")}
        >
          Split
        </button>
        <button
          className={isRead ? "on" : ""}
          title="Read only"
          onClick={() => store.showSingleView("preview")}
        >
          Read
        </button>
      </div>

      <button
        id="btn-toggle-theme"
        className="icon-btn"
        title={
          theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
        }
        onClick={() => void store.toggleTheme()}
      >
        {theme === "dark" ? <IconSun /> : <IconMoon />}
      </button>
      <button
        id="btn-settings"
        className="icon-btn"
        title="Settings (Ctrl+,)"
        onClick={() => useStore.setState({ settingsOpen: true })}
      >
        <IconSettings />
      </button>
    </header>
  );
}
