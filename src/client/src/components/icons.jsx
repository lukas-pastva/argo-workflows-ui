import React from "react";

// Simple, consistent inline SVG icons that inherit text color
// All icons are 16x16, stroke-based for crisp rendering in light/dark themes.

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
};

export function IconDownload(props) {
  return (
    <svg {...base} {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <path d="M7 10l5 5 5-5"/>
      <path d="M12 15V3"/>
    </svg>
  );
}

export function IconCopy(props) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  );
}

export function IconPause(props) {
  return (
    <svg {...base} {...props}>
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
  );
}

export function IconPlay(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 4l14 8-14 8V4z"/>
    </svg>
  );
}

export function IconClose(props) {
  return (
    <svg {...base} {...props}>
      <path d="M18 6L6 18"/>
      <path d="M6 6l12 12"/>
    </svg>
  );
}

export function IconZoomIn(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7"/>
      <path d="M21 21l-4.35-4.35"/>
      <path d="M11 8v6"/>
      <path d="M8 11h6"/>
    </svg>
  );
}

export function IconZoomOut(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7"/>
      <path d="M21 21l-4.35-4.35"/>
      <path d="M8 11h6"/>
    </svg>
  );
}

export function IconFilterX(props) {
  return (
    <svg {...base} {...props}>
      <path d="M22 3H2l8 9v7l4-2v-5l8-9z"/>
      <path d="M15.5 8.5l4 4"/>
      <path d="M19.5 8.5l-4 4"/>
    </svg>
  );
}

export function IconChevronLeft(props) {
  return (
    <svg {...base} {...props}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function IconChevronRight(props) {
  return (
    <svg {...base} {...props}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function IconChevronsLeft(props) {
  return (
    <svg {...base} {...props}>
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

export function IconList(props) {
  return (
    <svg {...base} {...props}>
      <line x1="8" y1="6"  x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6"  r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}

export function IconSun(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="1" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function IconMoon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

export function IconSunMoon(props) {
  return (
    <svg {...base} {...props}>
      {/* sun half */}
      <circle cx="9" cy="12" r="4" />
      <line x1="9" y1="3" x2="9" y2="5" />
      <line x1="9" y1="19" x2="9" y2="21" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="4.8" y1="6.8" x2="6.2" y2="8.2" />
      <line x1="4.8" y1="17.2" x2="6.2" y2="15.8" />
      {/* moon half */}
      <path d="M19 13.5A5.5 5.5 0 0112.5 7a4.5 4.5 0 106.5 6.5z" />
    </svg>
  );
}
