import React from "react";
import { IconClose } from "./icons";

/* ------------------------------------------------------------------ */
/*  Handy wrapper for one help row (icon + text)                      */
/* ------------------------------------------------------------------ */
function HelpItem({ icon, children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        marginBottom: "1rem",
      }}
    >
      <span
        style={{
          fontSize: "1.5rem",
          lineHeight: 1,
          width: "1.75rem",
          textAlign: "center",
        }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <p style={{ margin: 0, lineHeight: 1.4 }}>{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal                                                              */
/* ------------------------------------------------------------------ */
export default function HelpModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640 }}
      >
        <button className="modal-close" onClick={onClose} aria-label="close">
          <IconClose width={18} height={18} />
        </button>

        <h2 style={{ marginBottom: "1.25rem" }}>Quick guide</h2>

        <HelpItem icon="📤">
          <strong>Trigger a workflow&nbsp;–</strong> Pick a template, fill in the
          parameters and hit <em>Insert</em>. The special{" "}
          <code>event-data</code> field comes pre-filled with a JSON placeholder.
        </HelpItem>

        <HelpItem icon="🔄">
          <strong>Follow runs&nbsp;–</strong> New or running workflows appear in
          the list automatically; the table refreshes every&nbsp;10&nbsp;seconds.
        </HelpItem>

        <HelpItem icon="📜">
          <strong>View logs&nbsp;–</strong> Click the <em>log icon</em> to open a
          full-screen, auto-scrolling log viewer. ANSI colours are preserved and
          stay readable in both themes.
        </HelpItem>

        <HelpItem icon="🌓">
          <strong>Switch theme&nbsp;–</strong> Use the moon/sun button in the
          header to cycle&nbsp;through <em>auto → light → dark</em>. “Auto”
          follows your local daytime (light 7-19 h, dark otherwise).
        </HelpItem>
      </div>
    </div>
  );
}
