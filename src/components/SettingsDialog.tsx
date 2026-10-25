import { useEffect, useState } from "react";

import { api } from "../api";
import { COPYRIGHT, LICENSE_NAME } from "../branding";
import { EDITOR_FONTS, PREVIEW_FONTS, fontOptions } from "../fonts";
import { IconX } from "../icons";
import { useStore, DEFAULT_SETTINGS } from "../store";
import { toast } from "../toast";
import { useAppVersion } from "../useAppVersion";
import { checkForUpdates } from "../updater";
import { SelectMenu } from "./SelectMenu";

const THEME_OPTIONS = [
  { label: "Dark", value: "dark" },
  { label: "Light", value: "light" },
];

const ENCODING_OPTIONS = [
  { label: "UTF-8", value: "utf-8" },
  { label: "UTF-8 with BOM", value: "utf-8-sig" },
  { label: "UTF-16", value: "utf-16" },
  { label: "Windows-1252", value: "windows-1252" },
  { label: "ISO-8859-1", value: "iso-8859-1" },
];

export function SettingsDialog() {
  const open = useStore((state) => state.settingsOpen);
  const settings = useStore((state) => state.settings);
  const version = useAppVersion();
  const [contextMenuInstalled, setContextMenuInstalled] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api
      .fileAssociationStatus()
      .then(setContextMenuInstalled)
      .catch(() => setContextMenuInstalled(false));
  }, [open]);

  if (!open) return null;

  const update = (patch: Record<string, unknown>) => {
    void useStore.getState().updateSettings(patch);
  };

  const close = () => useStore.setState({ settingsOpen: false });

  const registerContextMenu = async () => {
    const result = await api.registerFileAssociation().catch((error) => ({
      error: String(error),
    }));
    if (result?.error) {
      toast.show(result.error, { type: "error" });
      return;
    }
    setContextMenuInstalled(true);
    toast.show("Explorer context menu added", { type: "success" });
  };

  const removeContextMenu = async () => {
    const result = await api.unregisterFileAssociation().catch((error) => ({
      error: String(error),
    }));
    if (result?.error) {
      toast.show(result.error, { type: "error" });
      return;
    }
    setContextMenuInstalled(false);
    toast.show("Explorer context menu removed", { type: "info" });
  };

  const openDefaultApps = async () => {
    const result = await api.openDefaultAppsSettings().catch((error) => ({
      error: String(error),
    }));
    if (result?.error) toast.show(result.error, { type: "error" });
  };

  const resetAllSettings = async () => {
    const confirmed = await toast.confirm(
      "Reset all settings to their defaults?",
      { confirmText: "Reset", cancelText: "Cancel" },
    );
    if (!confirmed) return;

    // Only the preference sections: leave recent files/folders untouched so a
    // reset does not rewrite the backend's file history.
    await useStore.getState().updateSettings({
      appearance: DEFAULT_SETTINGS.appearance,
      editor: DEFAULT_SETTINGS.editor,
      files: DEFAULT_SETTINGS.files,
      preview: DEFAULT_SETTINGS.preview,
      session: DEFAULT_SETTINGS.session,
    });
    toast.show("Settings reset to defaults", { type: "success" });
  };

  return (
    <div id="settings-panel">
      <div className="settings-overlay" onClick={close} />
      <div className="settings-dialog">
        <div className="settings-header">
          <div className="settings-heading">
            <span className="side-label">Preferences</span>
            <h2>Settings</h2>
          </div>
          <button className="settings-close" title="Close" onClick={close}>
            <IconX />
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-section">
            <h3>Appearance</h3>
            <div className="setting-row">
              <label>Theme</label>
              <SelectMenu
                ariaLabel="Theme"
                value={settings.appearance.theme}
                options={THEME_OPTIONS}
                onChange={(value) => update({ appearance: { theme: value } })}
              />
            </div>
            <div className="setting-row">
              <label>Zoom with Ctrl + mouse wheel</label>
              <input
                type="checkbox"
                checked={settings.appearance.zoom_enabled === true}
                onChange={(event) =>
                  update({
                    appearance: {
                      zoom_enabled: event.target.checked,
                      // Turning zoom off returns to 100%; turning it on keeps
                      // the last chosen level.
                      ...(event.target.checked ? {} : { zoom_level: 1 }),
                    },
                  })
                }
              />
            </div>
            {settings.appearance.zoom_enabled && (
              <div className="setting-row">
                <label>Zoom level</label>
                <div className="setting-actions">
                  <input
                    type="number"
                    min={50}
                    max={250}
                    step={10}
                    value={Math.round(
                      (settings.appearance.zoom_level || 1) * 100,
                    )}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      update({
                        appearance: {
                          zoom_level: Math.min(2.5, Math.max(0.5, value / 100)),
                        },
                      });
                    }}
                  />
                  {Math.round((settings.appearance.zoom_level || 1) * 100) !==
                    100 && (
                    <button
                      className="mv-btn"
                      title="Reset zoom to 100%"
                      onClick={() => update({ appearance: { zoom_level: 1 } })}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="setting-row">
              <label>Editor font size</label>
              <input
                type="number"
                min={10}
                max={32}
                value={settings.appearance.font_size_editor}
                onChange={(event) =>
                  update({
                    appearance: {
                      font_size_editor: Number(event.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="setting-row">
              <label>Preview font size</label>
              <input
                type="number"
                min={10}
                max={32}
                value={settings.appearance.font_size_preview}
                onChange={(event) =>
                  update({
                    appearance: {
                      font_size_preview: Number(event.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="setting-row">
              <label>Editor font family</label>
              <SelectMenu
                ariaLabel="Editor font family"
                className="font-select"
                value={settings.appearance.font_family_editor}
                options={fontOptions(
                  EDITOR_FONTS,
                  settings.appearance.font_family_editor,
                )}
                onChange={(value) =>
                  update({ appearance: { font_family_editor: value } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Preview font family</label>
              <SelectMenu
                ariaLabel="Preview font family"
                className="font-select"
                value={settings.appearance.font_family_preview}
                options={fontOptions(
                  PREVIEW_FONTS,
                  settings.appearance.font_family_preview,
                )}
                onChange={(value) =>
                  update({ appearance: { font_family_preview: value } })
                }
              />
            </div>
            <div className="font-samples">
              <div className="font-sample">
                <span className="font-sample-label">Editor sample</span>
                <span
                  className="font-sample-text"
                  style={{
                    fontFamily: settings.appearance.font_family_editor,
                  }}
                >
                  const greeting = "Hello, Markdown";
                </span>
              </div>
              <div className="font-sample">
                <span className="font-sample-label">Preview sample</span>
                <span
                  className="font-sample-text"
                  style={{
                    fontFamily: settings.appearance.font_family_preview,
                  }}
                >
                  The quick brown fox jumps over the lazy dog — 0123456789
                </span>
              </div>
            </div>
            <div className="setting-row">
              <label>Sidebar width</label>
              <input
                type="number"
                min={150}
                max={500}
                value={settings.appearance.sidebar_width}
                onChange={(event) =>
                  update({
                    appearance: { sidebar_width: Number(event.target.value) },
                  })
                }
              />
            </div>
            <div className="setting-row">
              <label>Show line numbers</label>
              <input
                type="checkbox"
                checked={settings.appearance.show_line_numbers}
                onChange={(event) =>
                  update({
                    appearance: { show_line_numbers: event.target.checked },
                  })
                }
              />
            </div>
            <div className="setting-row">
              <label>Show toolbar</label>
              <input
                type="checkbox"
                checked={settings.appearance.show_toolbar}
                onChange={(event) =>
                  update({ appearance: { show_toolbar: event.target.checked } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Show status bar</label>
              <input
                type="checkbox"
                checked={settings.appearance.show_statusbar}
                onChange={(event) =>
                  update({
                    appearance: { show_statusbar: event.target.checked },
                  })
                }
              />
            </div>
          </div>

          <div className="settings-section">
            <h3>Editor</h3>
            <div className="setting-row">
              <label>Word wrap</label>
              <input
                type="checkbox"
                checked={settings.editor.word_wrap}
                onChange={(event) =>
                  update({ editor: { word_wrap: event.target.checked } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Tab size</label>
              <input
                type="number"
                min={1}
                max={8}
                value={settings.editor.tab_size}
                onChange={(event) =>
                  update({ editor: { tab_size: Number(event.target.value) } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Auto close brackets</label>
              <input
                type="checkbox"
                checked={settings.editor.auto_close_brackets}
                onChange={(event) =>
                  update({
                    editor: { auto_close_brackets: event.target.checked },
                  })
                }
              />
            </div>
            <div className="setting-row">
              <label>Auto indent</label>
              <input
                type="checkbox"
                checked={settings.editor.auto_indent}
                onChange={(event) =>
                  update({ editor: { auto_indent: event.target.checked } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Highlight active line</label>
              <input
                type="checkbox"
                checked={settings.editor.highlight_active_line}
                onChange={(event) =>
                  update({
                    editor: { highlight_active_line: event.target.checked },
                  })
                }
              />
            </div>
            <div className="setting-row">
              <label>Match brackets</label>
              <input
                type="checkbox"
                checked={settings.editor.match_brackets}
                onChange={(event) =>
                  update({ editor: { match_brackets: event.target.checked } })
                }
              />
            </div>
          </div>

          <div className="settings-section">
            <h3>Files</h3>
            <div className="setting-row">
              <label>Auto save</label>
              <input
                type="checkbox"
                checked={settings.files.auto_save}
                onChange={(event) =>
                  update({ files: { auto_save: event.target.checked } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Auto save interval (seconds)</label>
              <input
                type="number"
                min={5}
                max={600}
                value={settings.files.auto_save_interval}
                onChange={(event) =>
                  update({
                    files: { auto_save_interval: Number(event.target.value) },
                  })
                }
              />
            </div>
            <div className="setting-row">
              <label>Default encoding</label>
              <SelectMenu
                ariaLabel="Default encoding"
                value={settings.files.default_encoding}
                options={ENCODING_OPTIONS}
                onChange={(value) =>
                  update({ files: { default_encoding: value } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Visible extensions</label>
              <input
                type="text"
                value={settings.files.visible_extensions.join(", ")}
                onChange={(event) =>
                  update({
                    files: {
                      visible_extensions: event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </div>
            <div className="setting-row">
              <label>Show hidden files</label>
              <input
                type="checkbox"
                checked={settings.files.show_hidden_files}
                onChange={(event) =>
                  update({ files: { show_hidden_files: event.target.checked } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Folders first</label>
              <input
                type="checkbox"
                checked={settings.files.folders_first}
                onChange={(event) =>
                  update({ files: { folders_first: event.target.checked } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Folder label segments</label>
              <input
                type="number"
                min={1}
                max={6}
                value={settings.files.folder_label_segments}
                onChange={(event) =>
                  update({
                    files: {
                      folder_label_segments: Number(event.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="setting-row">
              <label>Exclude patterns</label>
              <input
                type="text"
                value={settings.files.exclude_patterns.join(", ")}
                onChange={(event) =>
                  update({
                    files: {
                      exclude_patterns: event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </div>
          </div>

          <div className="settings-section">
            <h3>Preview</h3>
            <div className="setting-row">
              <label>Scroll sync</label>
              <input
                type="checkbox"
                checked={settings.preview.scroll_sync}
                onChange={(event) =>
                  update({ preview: { scroll_sync: event.target.checked } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Render math (KaTeX)</label>
              <input
                type="checkbox"
                checked={settings.preview.render_math}
                onChange={(event) =>
                  update({ preview: { render_math: event.target.checked } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Render Mermaid diagrams</label>
              <input
                type="checkbox"
                checked={settings.preview.render_mermaid}
                onChange={(event) =>
                  update({ preview: { render_mermaid: event.target.checked } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Double-click preview to edit</label>
              <input
                type="checkbox"
                checked={settings.preview.double_click_preview}
                onChange={(event) =>
                  update({
                    preview: { double_click_preview: event.target.checked },
                  })
                }
              />
            </div>
          </div>

          <div className="settings-section">
            <h3>Session</h3>
            <div className="setting-row">
              <label>Restore session on startup</label>
              <input
                type="checkbox"
                checked={settings.session.restore_session}
                onChange={(event) =>
                  update({ session: { restore_session: event.target.checked } })
                }
              />
            </div>
            <div className="setting-row">
              <label>Backup interval (seconds)</label>
              <input
                type="number"
                min={3}
                max={60}
                value={settings.session.backup_interval}
                onChange={(event) =>
                  update({
                    session: { backup_interval: Number(event.target.value) },
                  })
                }
              />
            </div>
          </div>

          <div className="settings-section">
            <h3>Windows integration</h3>
            <div className="setting-row">
              <label>Explorer context menu</label>
              <div className="setting-actions">
                {contextMenuInstalled ? (
                  <button className="mv-btn" onClick={removeContextMenu}>
                    Remove
                  </button>
                ) : (
                  <button className="mv-btn" onClick={registerContextMenu}>
                    Add "Open with MarkView"
                  </button>
                )}
              </div>
            </div>
            <div className="setting-row">
              <label>Default app for .md</label>
              <div className="setting-actions">
                <button className="mv-btn" onClick={openDefaultApps}>
                  Open Default Apps
                </button>
              </div>
            </div>
            <p className="setting-hint">
              The context menu is registered for the current user and needs no
              administrator rights. To make MarkView the default, choose it for
              .md under Windows Default Apps.
            </p>
          </div>

          <div className="settings-section">
            <h3>About</h3>
            <div className="setting-row">
              <label>Version</label>
              <span className="setting-value mono">{version}</span>
            </div>
            <div className="setting-row">
              <label>Updates</label>
              <div className="setting-actions">
                <button
                  className="mv-btn"
                  onClick={() => void checkForUpdates({ silent: false })}
                >
                  Check for updates
                </button>
              </div>
            </div>
            <div className="setting-row">
              <label>License</label>
              <span className="setting-value">{LICENSE_NAME}</span>
            </div>
            <div className="setting-row">
              <label>Copyright</label>
              <span className="setting-value">{COPYRIGHT}</span>
            </div>
            <p className="setting-hint">
              MarkView checks GitHub Releases at launch and installs new signed
              versions in the background.
            </p>
          </div>

          <div className="settings-section">
            <h3>Reset</h3>
            <div className="setting-row">
              <label>Restore defaults</label>
              <div className="setting-actions">
                <button className="mv-btn" onClick={resetAllSettings}>
                  Reset all settings
                </button>
              </div>
            </div>
            <p className="setting-hint">
              Theme, zoom, fonts, editor, files, preview and session preferences
              return to their defaults. Recent files and folders are kept.
            </p>
          </div>
        </div>
        <div className="settings-footer">
          <button onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
