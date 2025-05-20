import React from "react";

export default function HelpModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="close">
          ×
        </button>

        <h2>How to use Argo Workflows UI</h2>

        <p>
          <strong>Trigger a workflow :</strong> Pick a template, fill in the
          parameters and hit <em>Submit</em>. The special{" "}
          <code>event-data</code> parameter is pre-filled with a JSON
          placeholder for convenience.
        </p>

        <p>
          <strong>Follow runs :</strong> New or running workflows appear in the
          list below, grouped by their template reference. The list refreshes
          every 10 seconds.
        </p>

        <p>
          <strong>Logs :</strong> Click&nbsp;<em>Logs</em>&nbsp;to open a
          full-screen, auto-scrolling viewer for a workflow run.
        </p>
      </div>
    </div>
  );
}
