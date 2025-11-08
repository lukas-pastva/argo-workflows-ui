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
