// ThemeToggle – cycles between auto → light → dark
//
// * “auto” now follows **local time of day**
//     • dark mode 19:00 – 06:59 (browser time)
//     • light mode 07:00 – 18:59
//   The check reruns every 30 min so the UI flips automatically when the
//   boundary is crossed.
//
// * The effective choice is written to the root <html> element as
//   `data-theme="light|dark"` (or kept from a manual selection) and is
//   remembered per-tab in `sessionStorage` under the key “theme”.

import React, { useEffect, useState } from "react";

const THEME_ORDER = ["auto", "light", "dark"];
const ICON = {
  auto: "🌓",
  light: "🌞",
  dark : "🌙"
};

// ─── dark between 19:00 and 06:59 local browser time ────────────────
const DARK_START = 19;   // inclusive
const DARK_END   = 6;    // inclusive

function isDarkByClock() {
  const h = new Date().getHours();
  return h >= DARK_START || h <= DARK_END;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "auto";
    return sessionStorage.getItem("theme") || "auto";
  });

  /* ─── Apply / refresh theme ─────────────────────────────────── */
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      if (theme === "auto") {
        root.setAttribute("data-theme", isDarkByClock() ? "dark" : "light");
      } else {
        root.setAttribute("data-theme", theme);
      }
    };

    apply();                       // initial run
    sessionStorage.setItem("theme", theme);

    let timer = null;
    if (theme === "auto") {
      // re-check every 30 min in case the user keeps the page open
      timer = setInterval(apply, 30 * 60 * 1000);
    }
    return () => timer && clearInterval(timer);
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
