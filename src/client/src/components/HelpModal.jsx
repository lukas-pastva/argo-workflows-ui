import React from "react";
import { IconClose } from "./icons";
import ModalPortal from "./ModalPortal.jsx";

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
    <ModalPortal>
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
            <strong>View detail&nbsp;–</strong> Click any row to open a
            full-screen detail view containing labels, a mini pipeline view,
            and live logs. ANSI colours are preserved and stay readable in both
            themes. You can optionally enter a <em>pod name</em> and a <em>start
            timestamp</em> to begin at the first line at or after that time.
          </HelpItem>

          <HelpItem icon="🔗">
            <strong>Deep links&nbsp;–</strong> Open details directly via URL.
            Use <code>?detail=&lt;workflow&gt;</code> or <code>?detail=&lt;workflow&gt;/&lt;nodeId&gt;</code>.
            Or filter by a start time plus one of the extra columns shown in the list:
            <br />
            <code>?ts=&lt;timestamp&gt;&amp;&lt;columnKey&gt;=&lt;value&gt;</code>
            <br />
            Example: <code>?ts=2025-11-25T05:51:40Z&amp;application=o4be-dev-cpc</code>
            <br />
            The UI picks the run whose start time is closest at or after the
            given timestamp (ms precision). Timestamp accepts seconds,
            milliseconds, or ISO strings.
          </HelpItem>

          <HelpItem icon="🌓">
            <strong>Switch theme&nbsp;–</strong> Use the moon/sun button in the
            header to cycle&nbsp;through <em>auto → light → dark</em>. “Auto”
            follows your OS/browser preference (including sunset→sunrise
            schedules).
          </HelpItem>
        </div>
      </div>
    </ModalPortal>
  );
}
