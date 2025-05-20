import React from "react";

export default function DeleteConfirmModal({ names, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onCancel} aria-label="close">
          ×
        </button>

        <h2>Delete workflows</h2>

        <p>
          {names.length === 1
            ? <>Are you sure you want to delete workflow <code>{names[0]}</code>?</>
            : <>Are you sure you want to delete these {names.length} workflows?</>}
        </p>

        {names.length > 1 && (
          <ul style={{ maxHeight: 160, overflow: "auto" }}>
            {names.map((n) => (
              <li key={n}><code>{n}</code></li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem" }}>
          <button className="btn-danger" onClick={onConfirm}>Delete</button>
          <button className="btn-light" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
