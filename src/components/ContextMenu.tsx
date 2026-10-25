import { useEffect, useRef, useState } from "react";

import { contextMenu, type MenuItem } from "../contextMenu";

export function ContextMenu() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unregister = contextMenu.register((nextItems, x, y) => {
      setItems(nextItems);
      setPosition({ x, y });
    });
    return unregister;
  }, []);

  useEffect(() => {
    if (!position) return;
    const hide = (event: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) return;
      setPosition(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPosition(null);
    };
    // Defer so the opening right-click does not immediately close the menu.
    const id = window.setTimeout(() => {
      document.addEventListener("click", hide);
      document.addEventListener("contextmenu", hide);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("click", hide);
      document.removeEventListener("contextmenu", hide);
      document.removeEventListener("keydown", onKey);
    };
  }, [position]);

  if (!position) return null;

  const style = {
    left: Math.min(position.x, window.innerWidth - 220),
    top: Math.min(position.y, window.innerHeight - items.length * 30 - 20),
  };

  return (
    <div id="context-menu" ref={menuRef} style={style}>
      <div className="context-menu-items">
        {items.map((item, index) =>
          item.separator ? (
            <div className="context-menu-separator" key={`sep-${index}`} />
          ) : (
            <div
              className="context-menu-item"
              key={`${item.label}-${index}`}
              onClick={() => {
                setPosition(null);
                item.action?.();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && (
                <span className="context-menu-shortcut">{item.shortcut}</span>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
