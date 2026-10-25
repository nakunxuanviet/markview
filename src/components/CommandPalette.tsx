import { useEffect, useMemo, useRef, useState } from "react";

import { openFind, reloadAllFromDisk, saveActiveAs, compareWithSaved, compareWithFile } from "../actions";
import { IconCommand } from "../icons";
import { useStore } from "../store";

interface Command {
  label: string;
  shortcut?: string;
  run: () => void | Promise<void>;
}

export function CommandPalette() {
  const open = useStore((state) => state.paletteOpen);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const store = useStore.getState();
    const setState = useStore.setState;
    return [
      { label: "New File", shortcut: "Ctrl+N", run: () => store.createTab() },
      { label: "Open File...", shortcut: "Ctrl+O", run: () => store.openFileDialog() },
      { label: "Open Folder...", shortcut: "Ctrl+Shift+O", run: () => store.openFolder() },
      { label: "Save", shortcut: "Ctrl+S", run: () => store.saveActive() },
      { label: "Save As...", shortcut: "Ctrl+Shift+S", run: saveActiveAs },
      { label: "Close Tab", shortcut: "Ctrl+W", run: () => {
        const id = useStore.getState().activeId;
        if (id) void useStore.getState().closeTab(id);
      } },
      { label: "Close All Tabs", run: () => store.closeAll() },
      { label: "Reload All Files from Disk", run: reloadAllFromDisk },
      { label: "Find", shortcut: "Ctrl+F", run: () => openFind(false) },
      { label: "Find and Replace", shortcut: "Ctrl+H", run: () => openFind(true) },
      { label: "Search in Files", shortcut: "Ctrl+Shift+F", run: () => setState({ searchFilesOpen: true }) },
      { label: "Quick Open File", shortcut: "Ctrl+P", run: () => setState({ quickOpenOpen: true }) },
      { label: "Toggle Sidebar", shortcut: "Ctrl+\\", run: () => store.toggleSidebar() },
      { label: "Toggle Preview", shortcut: "Ctrl+Shift+V", run: () => store.togglePreview() },
      { label: "Single View", run: () => store.setViewMode("single") },
      { label: "Split View", run: () => store.setViewMode("split") },
      { label: "Show Editor", run: () => store.showSingleView("editor") },
      { label: "Show Preview", run: () => store.showSingleView("preview") },
      { label: "Toggle Theme", run: () => store.toggleTheme() },
      { label: "Toggle Zen Mode", shortcut: "F11", run: () => store.toggleZen() },
      { label: "Compare with Saved", run: compareWithSaved },
      { label: "Compare with File...", run: compareWithFile },
      { label: "Reload Folder", run: () => store.refreshTree() },
      { label: "Settings", shortcut: "Ctrl+,", run: () => setState({ settingsOpen: true }) },
    ];
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  if (!open) return null;

  const close = () => useStore.setState({ paletteOpen: false });
  const execute = (command: Command | undefined) => {
    if (!command) return;
    close();
    void command.run();
  };

  return (
    <div id="command-palette">
      <div className="cp-overlay" onClick={close} />
      <div className="cp-dialog">
        <div className="dialog-search">
          <IconCommand />
          <input
            ref={inputRef}
            type="text"
            id="cp-input"
            placeholder="Type a command"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((index) => Math.min(index + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                execute(filtered[selected]);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div id="cp-list">
          {filtered.map((command, index) => (
            <div
              key={command.label}
              className={`cp-item${index === selected ? " selected" : ""}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => execute(command)}
            >
              <span className="cp-label">{command.label}</span>
              {command.shortcut && <span className="cp-shortcut">{command.shortcut}</span>}
            </div>
          ))}
          {filtered.length === 0 && <div className="sif-empty">No commands</div>}
        </div>
        <div className="dialog-hint">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
        </div>
      </div>
    </div>
  );
}
