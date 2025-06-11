import React from "react";

/**
 * Small modal that shows – and lets the user copy – the failure message
 * for a workflow run.
 */
export default function FailureReasonModal({ name, reason, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="close">
          ×
        </button>

        <h2 style={{ marginTop: 0 }}>Failure reason – {name}</h2>

        <textarea
          readOnly
          value={reason}
          style={{
            width: "100%",
            height: 160,
            resize: "vertical",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
          }}
        />
      </div>
    </div>
  );
}
