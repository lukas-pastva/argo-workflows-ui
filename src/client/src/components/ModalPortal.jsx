import React from "react";
import { createPortal } from "react-dom";

/**
 * Renders modal content into a dedicated DOM node so that
 * fixed positioning is relative to the viewport and not
 * affected by filters/transforms on the main app shell.
 */
export default function ModalPortal({ children }) {
  if (typeof document === "undefined") return null;
  const target = document.getElementById("modal-root") || document.body;
  return createPortal(children, target);
}

