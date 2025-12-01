// ThemeToggle – cycles between auto → light → dark
//
// * “auto” follows the OS/browser preference via `prefers-color-scheme`.
//   In auto mode we do NOT set `data-theme` so CSS can pick the scheme and
//   react to live changes (including scheduled sunset→sunrise).
//
// * For explicit selections (light|dark) we set `data-theme` on <html> and
//   remember the choice per-tab in sessionStorage under the key “theme”.

import React, { useEffect, useState } from "react";
import { IconSun, IconMoon, IconSunMoon } from "./icons";

const THEME_ORDER = ["auto", "light", "dark"];

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

  const modeClass =
    theme === "dark"
      ? "theme-toggle-btn theme-toggle-btn--dark"
      : theme === "light"
        ? "theme-toggle-btn theme-toggle-btn--light"
        : "theme-toggle-btn theme-toggle-btn--auto";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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

