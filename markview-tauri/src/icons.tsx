import { useId } from "react";
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* Brand ------------------------------------------------------------------ */

/** Four ribbon facets of the folded M, in 64px brand space. */
const MARK_FACETS = [
  "M10 14h10v40H10z",
  "M20 14l12 16v20L20 34z",
  "M32 30l12-16v20L32 50z",
  "M44 14h10v40H44z",
];

const MARK_SEAMS = "M20 14v20M32 30v20M44 14v20";
const MARK_VALLEY = "M20 34l12 16 12-16";

/** Gradient ids must stay unique: several marks can share one document. */
function useGradientId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** App icon — Aurora: gradient squircle, ink ribbon. */
export function IconApp(props: IconProps) {
  const tile = useGradientId("mv-tile");
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient
          id={tile}
          x1="8"
          y1="4"
          x2="58"
          y2="62"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#a184ff" />
          <stop offset="0.5" stopColor="#6d4dff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${tile})`} />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="14.25"
        stroke="#fff"
        strokeOpacity="0.16"
        strokeWidth="1.5"
      />
      <g transform="translate(2.91 1.09) scale(0.909)">
        {MARK_FACETS.map((d) => (
          <path key={d} d={d} fill="#080b13" />
        ))}
        <path
          d={MARK_SEAMS}
          stroke="#fff"
          strokeOpacity="0.1"
          strokeWidth="1"
        />
        <path
          d={MARK_VALLEY}
          stroke="#000"
          strokeOpacity="0.18"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}

/** App icon — Editorial: ink tile, paper ribbon. */
export function IconAppLight(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <rect width="64" height="64" rx="3" fill="#1b1a16" />
      <g transform="translate(2.91 1.09) scale(0.909)">
        <path d={MARK_FACETS[0]} fill="#fbf9f3" />
        <path d={MARK_FACETS[1]} fill="#fbf9f3" opacity="0.95" />
        <path d={MARK_FACETS[2]} fill="#fbf9f3" opacity="0.88" />
        <path d={MARK_FACETS[3]} fill="#fbf9f3" opacity="0.8" />
        <path
          d={MARK_SEAMS}
          stroke="#1b1a16"
          strokeOpacity="0.32"
          strokeWidth="1"
        />
        <path
          d={MARK_VALLEY}
          stroke="#1b1a16"
          strokeOpacity="0.28"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg strokeWidth={1.9} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function IconCommand(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6a3 3 0 1 0-3 3h3V6zM15 6a3 3 0 1 1 3 3h-3V6zM9 18a3 3 0 1 1-3-3h3v3zM15 18a3 3 0 1 0 3-3h-3v3z" />
      <rect x="9" y="6" width="6" height="12" rx="1" />
    </Svg>
  );
}

export function IconSidebar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9.5 4v16" />
    </Svg>
  );
}

export function IconNewFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M12 11v6M9 14h6" />
    </Svg>
  );
}

export function IconOpenFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3h7v7" />
      <path d="M21 3l-9 9" />
      <path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
    </Svg>
  );
}

export function IconOpenFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 11v5M9.5 13.5 12 16l2.5-2.5" />
    </Svg>
  );
}

export function IconSave(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-7H7v7M7 3v5h8" />
    </Svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

export function IconFolderOpen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1H6.5L4 19z" />
      <path d="M4 19l2.5-8H22l-2.6 8z" />
    </Svg>
  );
}

export function IconFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6M9 17h4" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 6.3" />
      <path d="M20 4v7h-7" />
    </Svg>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5z" />
      <path d="m3 13 9 5 9-5" />
    </Svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.14.61.64 1.07 1.27 1.11H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1z" />
    </Svg>
  );
}

export function IconZen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    </Svg>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function IconSwap(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </Svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" />
    </Svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 18 5-5 3.5 3.5L16 12l4 5" />
    </Svg>
  );
}

export function IconList(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconOrderedList(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M4 5h1v4M3 9h3M3.5 14h2l-2 3h2" strokeWidth={1.4} />
    </Svg>
  );
}

export function IconQuote(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 7H6a3 3 0 0 0-3 3v3a3 3 0 0 0 3 3h2V7zM21 7h-4a3 3 0 0 0-3 3v3a3 3 0 0 0 3 3h2V7z" />
    </Svg>
  );
}

export function IconTable(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18M9 10v10" />
    </Svg>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <Svg strokeWidth={1.9} {...props}>
      <path d="M4 12h16" />
    </Svg>
  );
}
