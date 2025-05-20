import React from "react";

/**
 * Confirmation dialog shown before submitting a new workflow.
 */
export default function InsertConfirmModal({ template, onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center
                 bg-black/45"
      onClick={onCancel}
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
          onClick={onCancel}
          aria-label="close"
        >
          ×
        </button>

        <h2 className="mb-4 text-xl font-semibold">Submit workflow</h2>

        <p className="mb-6">
          Are you sure you want to start a new workflow from template{" "}
          <code className="font-mono">{template}</code>?
        </p>

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="rounded bg-primary px-5 py-2 font-medium
                       text-white hover:bg-primary/90"
          >
            Insert
          </button>
          <button
            onClick={onCancel}
            className="rounded border border-gray-400 px-5 py-2
                       text-gray-700 hover:bg-gray-100
                       dark:border-gray-500 dark:text-gray-200
                       dark:hover:bg-zinc-700/40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
