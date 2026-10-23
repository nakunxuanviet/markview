import { COPYRIGHT } from "../branding";
import { IconFile, IconNewFile, IconOpenFile, IconOpenFolder } from "../icons";
import { useStore } from "../store";
import { useAppVersion } from "../useAppVersion";
import { basename } from "../utils";

/** Keep the newest spelling of each path and drop case-only duplicates. */
function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const key = path.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }
  return result;
}

/**
 * Shown in the editor area when every tab is closed, so an empty window still
 * offers a way back in instead of a blank pane.
 */
export function EmptyState() {
  const version = useAppVersion();
  const recentFiles = useStore((state) => state.settings.recent_files);
  const store = useStore.getState();

  const files = uniquePaths(recentFiles ?? []).slice(0, 5);

  return (
    <div id="editor-empty">
      <div className="empty-inner">
        <span className="welcome-logo" aria-hidden="true">
          M
        </span>
        <h2>No file open</h2>
        <p>Create a new document or open one to start writing.</p>

        <div className="empty-actions">
          <button className="mv-btn primary" onClick={() => store.createTab()}>
            <IconNewFile />
            New file
          </button>
          <button
            className="mv-btn"
            onClick={() => void store.openFileDialog()}
          >
            <IconOpenFile />
            Open file
          </button>
          <button className="mv-btn" onClick={() => void store.openFolder()}>
            <IconOpenFolder />
            Open folder
          </button>
        </div>

        {files.length > 0 && (
          <div className="empty-recent">
            <span className="side-label">Recent files</span>
            {files.map((path) => (
              <div
                className="empty-recent-item"
                key={path}
                title={path}
                onClick={() => void store.openPath(path, false)}
              >
                <IconFile />
                <span>{basename(path)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="empty-meta">
          <span>{COPYRIGHT}</span>
          <span className="empty-meta-dot" />
          <span>v{version}</span>
        </div>
      </div>
    </div>
  );
}
