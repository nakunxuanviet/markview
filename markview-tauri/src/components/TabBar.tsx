import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { contextMenu } from "../contextMenu";
import { IconFile, IconPlus, IconX, IconZen } from "../icons";
import { useStore } from "../store";

export function TabBar() {
  const order = useStore((state) => state.order);
  const tabs = useStore((state) => state.tabs);
  const activeId = useStore((state) => state.activeId);
  const draggedId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible.
  useEffect(() => {
    if (!activeId || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, order.length]);

  const store = useStore.getState();
  const activeTab = activeId ? tabs[activeId] : undefined;

  const onContextMenu = (event: ReactMouseEvent, id: string) => {
    contextMenu.show(event, [
      { label: "Close", shortcut: "Ctrl+W", action: () => void store.closeTab(id) },
      { label: "Close Others", action: () => void store.closeOthers(id) },
      { label: "Close All", action: () => void store.closeAll() },
      { label: "Close to the Right", action: () => void store.closeToRight(id) },
      { separator: true },
      {
        label: "Copy Path",
        action: () => {
          const path = useStore.getState().tabs[id]?.path;
          if (path) void navigator.clipboard.writeText(path);
        },
      },
      {
        label: "Copy Filename",
        action: () => {
          const name = useStore.getState().tabs[id]?.filename;
          if (name) void navigator.clipboard.writeText(name);
        },
      },
    ]);
  };

  return (
    <div id="tab-bar">
      <div id="tab-list" ref={listRef}>
        {order.map((id) => {
          const tab = tabs[id];
          if (!tab) return null;
          return (
            <div
              key={id}
              className={`tab${tab.isPreview ? " preview-tab" : ""}${tab.modified ? " modified" : ""}${
                id === activeId ? " active" : ""
              }`}
              data-tab-id={id}
              data-drag-init="1"
              title={tab.path ?? tab.filename}
              draggable
              onClick={(event) => {
                if ((event.target as HTMLElement).classList.contains("tab-close")) return;
                store.activate(id);
              }}
              onDoubleClick={() => {
                if (!tab.isPreview) return;
                useStore.setState((state) => ({
                  tabs: { ...state.tabs, [id]: { ...state.tabs[id], isPreview: false } },
                  previewTabId: state.previewTabId === id ? null : state.previewTabId,
                }));
              }}
              onAuxClick={(event) => {
                if (event.button === 1) void store.closeTab(id);
              }}
              onContextMenu={(event) => onContextMenu(event, id)}
              onDragStart={(event) => {
                draggedId.current = id;
                event.dataTransfer.effectAllowed = "move";
                (event.currentTarget as HTMLElement).classList.add("dragging");
              }}
              onDragEnd={(event) => {
                (event.currentTarget as HTMLElement).classList.remove("dragging");
                draggedId.current = null;
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = draggedId.current;
                if (!source || source === id) return;
                useStore.setState((state) => {
                  const next = [...state.order];
                  const from = next.indexOf(source);
                  const to = next.indexOf(id);
                  if (from < 0 || to < 0) return state;
                  next.splice(from, 1);
                  next.splice(to, 0, source);
                  return { order: next };
                });
              }}
            >
              <IconFile className="tab-icon" />
              <span className="tab-name">{tab.filename}</span>
              <span className="tab-modified" />
              <span
                className="tab-close"
                title="Close"
                onClick={(event) => {
                  event.stopPropagation();
                  void store.closeTab(id);
                }}
              >
                <IconX />
              </span>
            </div>
          );
        })}
        <button id="btn-new-tab" title="New tab (Ctrl+N)" onClick={() => store.createTab()}>
          <IconPlus />
        </button>
      </div>
      <div className="tab-spacer" />
      {activeTab && (
        <span className={`tab-status${activeTab.modified ? " modified" : ""}`}>
          <i />
          {activeTab.modified
            ? "Unsaved"
            : activeTab.path
              ? "Saved"
              : "Draft"}
        </span>
      )}
      <button
        className="icon-btn sm"
        title="Zen mode (F11)"
        onClick={() => void store.toggleZen()}
      >
        <IconZen />
      </button>
    </div>
  );
}
