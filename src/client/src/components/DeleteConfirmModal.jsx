import React from "react";
import { IconClose } from "./icons";
import ModalPortal from "./ModalPortal.jsx";

export default function DeleteConfirmModal({ names, onConfirm, onCancel }) {
  return (
    <ModalPortal>
      <div className="modal-overlay" onClick={onCancel}>
        <div
          className="modal-dialog"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 480 }}
        >
          <button className="modal-close" onClick={onCancel} aria-label="close">
            <IconClose width={18} height={18} />
          </button>

          {/* Warning icon */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: "var(--radius-full)",
              background: "linear-gradient(135deg, var(--danger-50) 0%, var(--danger-100) 100%)",
              marginBottom: "var(--space-4)",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--danger)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h2 style={{ marginBottom: "var(--space-3)" }}>Delete workflows</h2>

          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
            {names.length === 1 ? (
              <>
                Are you sure you want to delete workflow{" "}
                <code
                  style={{
                    background: "var(--bg-subtle)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.875em",
                  }}
                >
                  {names[0]}
                </code>
                ?
              </>
            ) : (
              <>
                Are you sure you want to delete these{" "}
                <strong style={{ color: "var(--danger)" }}>{names.length}</strong>{" "}
                workflows? This action cannot be undone.
              </>
            )}
          </p>

          {names.length > 1 && (
            <ul
              style={{
                maxHeight: 180,
                overflow: "auto",
                background: "var(--bg-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3)",
                marginBottom: "var(--space-4)",
                listStyle: "none",
              }}
            >
              {names.map((n, i) => (
                <li
                  key={n}
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius-sm)",
                    background: i % 2 === 0 ? "transparent" : "var(--card-bg)",
                    fontSize: "0.8125rem",
                    fontFamily: "monospace",
                  }}
                >
                  {n}
                </li>
              ))}
            </ul>
          )}

          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              justifyContent: "flex-end",
              paddingTop: "var(--space-3)",
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <button className="btn-light" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn-danger" onClick={onConfirm}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginRight: "var(--space-2)" }}
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-2 14H7L5 6" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Delete {names.length > 1 && `(${names.length})`}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
