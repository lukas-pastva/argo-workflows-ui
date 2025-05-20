import React from "react";

/**
 * Re‑usable CSS spinner
 *
 * Props
 *  – small (Boolean) : render a tiny 16 px variant (good for buttons)
 */
export default function Spinner({ small = false }) {
  return (
    <span
      className={small ? "spinner spinner-sm" : "spinner"}
      aria-label="loading"
    />
  );
}
