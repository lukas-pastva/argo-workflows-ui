import React, { useEffect, useState } from "react";

const STEPS = ["auto", "light", "dark"];
const ICON  = { auto:"🌓", light:"🌞", dark:"🌙" };

export default function ThemeToggle() {
  const [mode, setMode] = useState(
    () => sessionStorage.getItem("theme") || "auto"
  );

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    sessionStorage.setItem("theme", mode);
  }, [mode]);

  return (
    <button
      className="rounded border border-white/80 bg-transparent px-2.5 py-1
                 text-lg leading-none hover:bg-white/15"
      onClick={() => setMode(STEPS[(STEPS.indexOf(mode)+1)%STEPS.length])}
      title={`Theme: ${mode}`}
    >
      {ICON[mode]}
    </button>
  );
}
