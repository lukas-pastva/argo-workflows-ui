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
import { IconSun, IconMoon, IconSunMoon } from "./icons";

const THEME_ORDER = ["auto", "light", "dark"];
function ThemeIcon({ mode }) {
  if (mode === "light") return <IconSun />;
  if (mode === "dark")  return <IconMoon />;
  return <IconSunMoon />; // auto
}

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
  // Darkness level for dark theme only: 0 = normal, 1 = dim, 2 = extra dark
  const [darkness, setDarkness] = useState(() => {
    if (typeof window === "undefined") return 0;
    const v = sessionStorage.getItem("darkness");
    return v != null ? Number(v) : 0;
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

  // Apply darkness level: stored on <html data-darkness="0|1|2">
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-darkness", String(darkness));
    sessionStorage.setItem("darkness", String(darkness));
  }, [darkness]);

  /* ─── Cycle on click ────────────────────────────────────────── */
  const cycle = () => {
    const idx = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <button
        className="btn-light"
        onClick={cycle}
        title={`Theme: ${theme}`}
        aria-label={`Theme: ${theme}`}
      >
        <span className="btn-icon" aria-hidden>
          <ThemeIcon mode={theme} />
        </span>
        {theme}
      </button>

      {/* Darkness slider: only visually affects dark theme; 3 steps */}
      <label
        title="Darkness level"
        style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
      >
        <span style={{ fontSize: "0.8rem", opacity: 0.85 }}>Dim</span>
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={darkness}
          onChange={(e) => setDarkness(Number(e.target.value))}
          aria-label="Darkness level"
          style={{ width: 80, accentColor: "currentColor", verticalAlign: "middle" }}
        />
        <span style={{ fontSize: "0.8rem", opacity: 0.85 }}>Darker</span>
      </label>
    </div>
  );
}
