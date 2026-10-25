import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { IconChevronRight } from "../icons";

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectMenuProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}

interface MenuRect {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/**
 * Lightweight listbox for settings. The native `<select>` popup ignores the
 * app palette in WebView2 and opens as a white system menu, so the options are
 * drawn with the same tokens as the rest of the UI.
 */
export function SelectMenu({
  value,
  options,
  onChange,
  className = "",
  ariaLabel,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<MenuRect | null>(null);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex] ?? { label: value, value };

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const bounds = trigger.getBoundingClientRect();
    const margin = 8;
    const width = Math.max(bounds.width, 180);
    const desiredHeight = options.length * 32 + 8;
    const below = window.innerHeight - bounds.bottom - margin;
    const above = bounds.top - margin;
    const openUp = below < Math.min(desiredHeight, 220) && above > below;
    const maxHeight = Math.max(
      120,
      Math.min(300, openUp ? above : below, desiredHeight),
    );

    setRect({
      left: Math.max(
        margin,
        Math.min(bounds.left, window.innerWidth - width - margin),
      ),
      top: openUp
        ? Math.max(margin, bounds.top - maxHeight - 4)
        : bounds.bottom + 4,
      width,
      maxHeight,
    });
  };

  const openMenu = () => {
    place();
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus();

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);

    document.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const move = (delta: number) =>
    setActive((index) => (index + delta + options.length) % options.length);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const option = options[active];
        if (option) choose(option);
        break;
      }
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div className="select-menu-root">
      <button
        ref={triggerRef}
        type="button"
        className={`select-trigger ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (
            event.key === "ArrowDown" ||
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            if (!open) openMenu();
          }
        }}
      >
        <span className="select-value">{selected.label}</span>
        <IconChevronRight className="select-chevron" />
      </button>
      {open && rect && (
        <div
          ref={menuRef}
          className="select-menu"
          role="listbox"
          tabIndex={-1}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            maxHeight: rect.maxHeight,
          }}
          onKeyDown={onMenuKeyDown}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`select-menu-item${index === active ? " active" : ""}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
