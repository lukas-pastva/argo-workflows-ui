import React from "react";

export default function DeleteConfirmModal({ names, onConfirm, onCancel }) {
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
          onClick={onCancel}
          className="absolute right-3 top-3 text-2xl leading-none
                     text-gray-500 hover:text-gray-800 dark:text-gray-300"
          aria-label="close"
        >
          ×
        </button>

        <h2 className="mb-4 text-xl font-semibold">Delete workflows</h2>

        <p className="mb-4">
          {names.length === 1
            ? <>Are you sure you want to delete workflow <code>{names[0]}</code>?</>
            : <>Are you sure you want to delete these {names.length} workflows?</>}
        </p>

        {names.length > 1 && (
          <ul className="mb-4 max-h-40 overflow-auto">
            {names.map((n) => <li key={n}><code>{n}</code></li>)}
          </ul>
        )}

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="rounded bg-red-500 px-4 py-1.5 font-medium
                       text-white hover:bg-red-600"
          >
            Delete
          </button>
          <button
            onClick={onCancel}
            className="rounded border border-gray-400 px-4 py-1.5
                       text-gray-700 hover:bg-gray-100 dark:border-gray-500
                       dark:text-gray-200 dark:hover:bg-gray-700/30"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
