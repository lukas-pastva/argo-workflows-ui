import React, { useEffect } from "react";

/**
 * Error banner that auto‑dismisses after a configurable time.
 *
 * Props
 *  – message  (String)  : error text to show; empty/false hides the banner
 *  – onClose  (Func)    : callback that clears the error in the parent
 *  – duration (Number)  : how long to stay visible (ms); default 5000 ms
 */
export default function ErrorBanner({ message, onClose, duration = 5000 }) {
  /* ─── Auto‑dismiss when a new message arrives ─────────────────────── */
  useEffect(() => {
    if (!message) return undefined;             // nothing to do
    const id = setTimeout(onClose, duration);   // hide after N ms
    return () => clearTimeout(id);              // cleanup on unmount/change
  }, [message, onClose, duration]);

  if (!message) return null;

  return (
    <div
      style={{
        background   : "#fee",
        color        : "#a00",
        padding      : "0.75rem 1rem",
        borderBottom : "1px solid #d88",
        display      : "flex",
        alignItems   : "center",
        justifyContent: "space-between"
      }}
    >
      <span>{message}</span>
      <button
        style={{
          marginLeft : "1rem",
          background : "transparent",
          border     : "none",
          fontSize   : "1.2rem",
          cursor     : "pointer",
          color      : "#a00"
        }}
        onClick={onClose}
        aria-label="close"
      >
        ×
      </button>
    </div>
  );
}
