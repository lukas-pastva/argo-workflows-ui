import React from "react";

export default function HelpModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center
                 bg-black/45"
      onClick={onClose}
    >
      <div
        className="relative w-[min(90vw,600px)] rounded-lg
                   bg-white p-8 text-gray-900 shadow-lg
                   dark:bg-zinc-800 dark:text-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-3 top-3 text-2xl leading-none
                     text-gray-500 hover:text-gray-800 dark:text-gray-300"
          onClick={onClose}
          aria-label="close"
        >
          ×
        </button>

        <h2 className="mb-4 text-xl font-semibold">How to use Argo Workflows UI</h2>

        <p className="mb-3">
          <strong>Trigger a workflow :</strong> Pick a template, fill in the
          parameters and hit <em>Submit</em>. The special{" "}
          <code className="font-mono">event-data</code> parameter is pre-filled
          with a JSON placeholder for convenience.
        </p>

        <p className="mb-3">
          <strong>Follow runs :</strong> New or running workflows appear in the
          list below, grouped by their template reference. The list refreshes
          every&nbsp;10 seconds.
        </p>

        <p>
          <strong>Logs :</strong> Click <em>Logs</em> to open a full-screen,
          auto-scrolling viewer for a workflow run.
        </p>
      </div>
    </div>
  );
}
