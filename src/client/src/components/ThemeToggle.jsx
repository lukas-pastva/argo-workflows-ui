import React, { useEffect, useState } from "react";

const THEME_ORDER = ["auto", "light", "dark"];
const ICON = {
  auto : "🌓",
  light: "🌞",
  dark : "🌙"
};

/**
 * Cycles between “auto → light → dark” and stores the
 * choice in sessionStorage for the current tab.
 *
 * Attaches `data-theme="light|dark"` to <html>.
 * When “auto” is selected the attribute is removed and
 * CSS falls back to `prefers-color-scheme`.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "auto";
    return sessionStorage.getItem("theme") || "auto";
  });

  /* ─── Apply theme & persist ─────────────────────────────────── */
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    sessionStorage.setItem("theme", theme);
  }, [theme]);

  /* ─── Cycle on click ────────────────────────────────────────── */
  const cycle = () => {
    const idx = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  };

  return (
    <button
      className="btn-light"
      onClick={cycle}
      title={`Theme: ${theme}`}
      style={{ marginRight: "0.4rem" }}
    >
      {ICON[theme]}
    </button>
  );
}
