import { COPYRIGHT_HOLDER, COPYRIGHT_YEAR } from "../branding";
import { IconCommand, IconImage, IconOpenFolder, IconSearch } from "../icons";

/**
 * Shown in the editor area when every tab is closed. The sidebar owns the
 * actions, so this pane stays a quiet watermark plus a shortcut cheat sheet.
 */
export function EmptyState() {
  return (
    <div id="editor-empty">
      <div className="empty-inner">
        <div className="empty-word" aria-hidden="true">
          Mark<em>View</em>
        </div>

        <div className="empty-keys">
          <div className="empty-row">
            <span>
              <IconCommand />
              Command palette
            </span>
            <kbd className="mv-kbd">Ctrl Shift P</kbd>
          </div>
          <div className="empty-row">
            <span>
              <IconSearch />
              Quick open file
            </span>
            <kbd className="mv-kbd">Ctrl P</kbd>
          </div>
          <div className="empty-row">
            <span>
              <IconOpenFolder />
              Open folder
            </span>
            <kbd className="mv-kbd">Ctrl Shift O</kbd>
          </div>
          <div className="empty-row">
            <span>
              <IconImage />
              Toggle preview
            </span>
            <kbd className="mv-kbd">Ctrl Shift V</kbd>
          </div>
        </div>

        <div className="empty-credit">
          Copyright {COPYRIGHT_YEAR} {COPYRIGHT_HOLDER}
        </div>
      </div>
    </div>
  );
}
