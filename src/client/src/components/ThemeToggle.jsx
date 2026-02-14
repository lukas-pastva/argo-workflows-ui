// ThemeToggle – cycles between auto → light → dark
//
// * “auto” follows the OS/browser preference via `prefers-color-scheme`.
//   In auto mode we do NOT set `data-theme` so CSS can pick the scheme and
//   react to live changes (including scheduled sunset→sunrise).
//
// * For explicit selections (light|dark) we set `data-theme` on <html> and
//   remember the choice per-tab in sessionStorage under the key “theme”.

import React, { useEffect, useState, useCallback } from "react";
import { IconSun, IconMoon, IconSunMoon } from "./icons";

const THEME_ORDER = ["auto", "light", "dark"];

const ZOOM_KEY = "ui-zoom";
const ZOOM_MIN = 70;
const ZOOM_MAX = 150;
const ZOOM_STEP = 10;
const ZOOM_DEFAULT = 120;

function ThemeIcon({ mode }) {
  if (mode === "light") return <IconSun />;
  if (mode === "dark") return <IconMoon />;
  return <IconSunMoon />; // auto
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "auto";
    return sessionStorage.getItem("theme") || "auto";
  });

  // Apply / refresh theme
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      if (theme === "auto") {
        // Let CSS @media (prefers-color-scheme) decide
        root.removeAttribute("data-theme");
      } else {
        root.setAttribute("data-theme", theme);
      }
    };

    apply();
    sessionStorage.setItem("theme", theme);

    // No interval needed; OS preference changes are handled by CSS.
    return undefined;
  }, [theme]);

  // Cycle on click
  const cycle = () => {
    const idx = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  };

  // Zoom
  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return ZOOM_DEFAULT;
    const saved = parseInt(localStorage.getItem(ZOOM_KEY), 10);
    return saved >= ZOOM_MIN && saved <= ZOOM_MAX ? saved : ZOOM_DEFAULT;
  });

  const applyZoom = useCallback((z) => {
    document.documentElement.style.fontSize = `${13 * z / 100}px`;
    localStorage.setItem(ZOOM_KEY, String(z));
  }, []);

  useEffect(() => { applyZoom(zoom); }, [zoom, applyZoom]);

  const zoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX));
  const zoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN));

  const modeClass =
    theme === "dark"
      ? "theme-toggle-btn theme-toggle-btn--dark"
      : theme === "light"
        ? "theme-toggle-btn theme-toggle-btn--light"
        : "theme-toggle-btn theme-toggle-btn--auto";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
      <button className="btn-light" onClick={zoomOut} title="Zoom out" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN}>-</button>
      <span style={{ fontSize: "0.7rem", minWidth: "2.2em", textAlign: "center" }}>{zoom}%</span>
      <button className="btn-light" onClick={zoomIn} title="Zoom in" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX}>+</button>
      <button
        className={`btn-light ${modeClass}`}
        onClick={cycle}
        title={`Theme: ${theme}`}
        aria-label={`Theme: ${theme}`}
      >
        <span className="btn-icon" aria-hidden>
          <ThemeIcon mode={theme} />
        </span>
        {theme}
      </button>
    </div>
  );
}

