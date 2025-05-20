import React from "react";

/**
 * Confirmation dialog shown before submitting a new workflow.
 */
export default function InsertConfirmModal({ template, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onCancel} aria-label="close">
          ×
        </button>

        <h2>Submit workflow</h2>

        <p>
          Are you sure you want to start a new workflow from template{" "}
          <code>{template}</code>?
        </p>

        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem" }}>
          <button className="btn" onClick={onConfirm}>
            Insert
          </button>
          <button className="btn-light" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
