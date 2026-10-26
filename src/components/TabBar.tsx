import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { contextMenu } from "../contextMenu";
import { IconChevronRight, IconFile, IconPlus, IconX, IconZen } from "../icons";
import { useStore } from "../store";

export function TabBar() {
  const order = useStore((state) => state.order);
  const tabs = useStore((state) => state.tabs);
  const activeId = useStore((state) => state.activeId);
  const draggedId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const syncOverflow = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const max = list.scrollWidth - list.clientWidth;
    const next = {
      left: list.scrollLeft > 1,
      right: list.scrollLeft < max - 1,
    };
    setOverflow((prev) =>
      prev.left === next.left && prev.right === next.right ? prev : next,
    );
  }, []);

  // Track whether the strip overflows so the scroll arrows only show when needed.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(syncOverflow);
    observer.observe(list);
    list.addEventListener("scroll", syncOverflow, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", syncOverflow);
    };
  }, [syncOverflow]);

  useEffect(() => {
    const frame = requestAnimationFrame(syncOverflow);
    return () => cancelAnimationFrame(frame);
  }, [order.length, syncOverflow]);

  // A vertical wheel scrolls the strip horizontally once it overflows.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const onWheel = (event: WheelEvent) => {
      if (list.scrollWidth <= list.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      list.scrollLeft += event.deltaY;
    };
    list.addEventListener("wheel", onWheel, { passive: false });
    return () => list.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the active tab visible without scrolling the whole page.
  useEffect(() => {
    const list = listRef.current;
    if (!activeId || !list) return;
    const node = list.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(activeId)}"]`,
    );
    if (!node) return;
    const listRect = list.getBoundingClientRect();
    const tabRect = node.getBoundingClientRect();
    if (tabRect.left < listRect.left)
      list.scrollLeft -= listRect.left - tabRect.left;
    else if (tabRect.right > listRect.right)
      list.scrollLeft += tabRect.right - listRect.right;
  }, [activeId, order.length]);

  const scrollTabs = (direction: 1 | -1) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({
      left: direction * Math.max(160, list.clientWidth * 0.7),
      behavior: "smooth",
    });
  };

  const store = useStore.getState();
  const activeTab = activeId ? tabs[activeId] : undefined;

  const onContextMenu = (event: ReactMouseEvent, id: string) => {
    contextMenu.show(event, [
      {
        label: "Close",
        shortcut: "Ctrl+W",
        action: () => void store.closeTab(id),
      },
      { label: "Close Others", action: () => void store.closeOthers(id) },
      { label: "Close All", action: () => void store.closeAll() },
      {
        label: "Close to the Right",
        action: () => void store.closeToRight(id),
      },
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
                if (
                  (event.target as HTMLElement).classList.contains("tab-close")
                )
                  return;
                store.activate(id);
              }}
              onDoubleClick={() => {
                if (!tab.isPreview) return;
                useStore.setState((state) => ({
                  tabs: {
                    ...state.tabs,
                    [id]: { ...state.tabs[id], isPreview: false },
                  },
                  previewTabId:
                    state.previewTabId === id ? null : state.previewTabId,
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
                (event.currentTarget as HTMLElement).classList.remove(
                  "dragging",
                );
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
      </div>
      {(overflow.left || overflow.right) && (
        <div className="tab-scroll">
          <button
            className="tab-scroll-btn prev"
            title="Scroll tabs left"
            disabled={!overflow.left}
            onClick={() => scrollTabs(-1)}
          >
            <IconChevronRight />
          </button>
          <button
            className="tab-scroll-btn next"
            title="Scroll tabs right"
            disabled={!overflow.right}
            onClick={() => scrollTabs(1)}
          >
            <IconChevronRight />
          </button>
        </div>
      )}
      <button
        id="btn-new-tab"
        title="New tab (Ctrl+N)"
        onClick={() => store.createTab()}
      >
        <IconPlus />
      </button>
      <div className="tab-spacer" />
      {activeTab && (
        <span className={`tab-status${activeTab.modified ? " modified" : ""}`}>
          <i />
          {activeTab.modified ? "Unsaved" : activeTab.path ? "Saved" : "Draft"}
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
