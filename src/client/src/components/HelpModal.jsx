import React from "react";
import { IconClose } from "./icons";
import ModalPortal from "./ModalPortal.jsx";

/* ------------------------------------------------------------------ */
/*  Styled help item with icon                                         */
/* ------------------------------------------------------------------ */
function HelpItem({ icon, title, children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-4)",
        padding: "var(--space-4)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-subtle)",
        marginBottom: "var(--space-3)",
        transition: "all var(--transition-base)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "var(--radius-md)",
          background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-600) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 2px 8px rgba(24, 190, 148, 0.25)",
        }}
      >
        <span style={{ fontSize: "1.25rem", filter: "grayscale(100%) brightness(10)" }}>
          {icon}
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <h4
          style={{
            margin: "0 0 var(--space-1)",
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--text-color)",
          }}
        >
          {title}
        </h4>
        <p
          style={{
            margin: 0,
            lineHeight: 1.5,
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
          }}
        >
          {children}
        </p>
      </div>
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

          {/* Header */}
          <div style={{ marginBottom: "var(--space-6)" }}>
            <h2 style={{ marginBottom: "var(--space-2)" }}>Quick Guide</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              Everything you need to know to get started with Argo Workflows UI
            </p>
          </div>

          <HelpItem icon="📤" title="Trigger a Workflow">
            Pick a template, fill in the parameters and hit <em>Insert</em>. The special{" "}
            <code
              style={{
                background: "var(--card-bg)",
                padding: "2px 6px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8125em",
              }}
            >
              event-data
            </code>{" "}
            field comes pre-filled with a JSON placeholder.
          </HelpItem>

          <HelpItem icon="🔄" title="Follow Runs">
            New or running workflows appear in the list automatically. The table refreshes
            every 10 seconds to keep you updated in real-time.
          </HelpItem>

          <HelpItem icon="📜" title="View Details">
            Click any row to open a full-screen detail view with labels, a mini pipeline view,
            and live logs. ANSI colors are preserved and readable in both themes.
          </HelpItem>

          <HelpItem icon="🔗" title="Deep Links">
            Open details directly via URL using{" "}
            <code
              style={{
                background: "var(--card-bg)",
                padding: "2px 6px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8125em",
              }}
            >
              ?detail=&lt;workflow&gt;
            </code>
            {" "}or filter by timestamp plus column values like{" "}
            <code
              style={{
                background: "var(--card-bg)",
                padding: "2px 6px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8125em",
              }}
            >
              ?ts=&lt;time&gt;&amp;app=value
            </code>
          </HelpItem>

          <HelpItem icon="🌓" title="Switch Theme">
            Use the theme button in the header to cycle through{" "}
            <strong>auto → light → dark</strong>. "Auto" follows your OS preference including
            sunset/sunrise schedules.
          </HelpItem>

          {/* Footer */}
          <div
            style={{
              marginTop: "var(--space-4)",
              paddingTop: "var(--space-4)",
              borderTop: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button className="btn" onClick={onClose}>
              Got it
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
