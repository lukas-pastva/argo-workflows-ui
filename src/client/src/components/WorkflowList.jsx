import React, { useEffect, useState, useMemo } from "react";
import {
  listWorkflows,
  deleteWorkflow,
  deleteWorkflows,
} from "../api";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

/* ------------------------------------------------------------------ */
/*  Build-time configuration via Vite env                             */
/* ------------------------------------------------------------------ */
const rawSkip = (import.meta.env.VITE_SKIP_LABELS || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const collapsedSet = new Set(
  (import.meta.env.VITE_COLLAPSED_LABEL_GROUPS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
);

const trimPrefixes = (import.meta.env.VITE_LABEL_PREFIX_TRIM || "events.argoproj.io/")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

/* — helpers — */
const shouldSkip = (k, v) =>
  rawSkip.some((p) =>
    p.includes("=") 
      ? p === `${k}=${v}` 
      : p === k
  );

const trimKey = (k) => {
  for (const pref of trimPrefixes) {
    if (k.startsWith(pref)) {
      return k.slice(pref.length);
    }
  }
  return k;
};

export default function WorkflowList({ onShowLogs, onError = () => {} }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [confirmNames, setConfirmNames] = useState(null);
  const [filters, setFilters] = useState({});

  /* fetch + auto-refresh */
  useEffect(() => {
    async function fetchAll() {
      try {
        setItems(await listWorkflows());
      } catch (e) {
        onError(
          e.status === 403
            ? "Access denied (HTTP 403)."
            : `Error loading workflows: ${e.message}`
        );
      }
    }
    fetchAll();
    const id = setInterval(fetchAll, 10_000);
    return () => clearInterval(id);
  }, [onError]);

  /* collect label groups (displayKey → [{ value, fullKey }]) */
  const labelGroups = useMemo(() => {
    const g = {};
    items.forEach((wf) => {
      Object.entries(wf.metadata.labels || {}).forEach(([k, v]) => {
        if (shouldSkip(k, v)) return;
        const displayKey = trimKey(k);
        if (!g[displayKey]) g[displayKey] = new Map();
        g[displayKey].set(v, k);
      });
    });
    return Object.fromEntries(
      Object.entries(g).map(([displayKey, map]) => [
        displayKey,
        Array.from(map.entries())
          .map(([value, fullKey]) => ({ value, fullKey }))
          .sort((a, b) => a.value.localeCompare(b.value))
      ])
    );
  }, [items]);

  /* filter helpers */
  const toggleFilter = (pair) =>
    setFilters((f) => ({ ...f, [pair]: !f[pair] }));

  const activePairs = Object.entries(filters)
    .filter(([, on]) => on)
    .map(([p]) => p);

  const filteredItems =
    activePairs.length === 0
      ? items
      : items.filter((wf) =>
          activePairs.every((pair) => {
            const [k, v] = pair.split("=");
            return wf.metadata.labels?.[k] === v;
          })
        );

  /* selection logic */
  const isRunning = (wf) => wf.status.phase === "Running";
  const nonRunning = filteredItems.filter((wf) => !isRunning(wf));
  const allSel =
    nonRunning.length > 0 &&
    nonRunning.every((wf) => selected[wf.metadata.name]);

  const toggleRow = (wf) => {
    if (isRunning(wf)) return;
    setSelected((s) => ({
      ...s,
      [wf.metadata.name]: !s[wf.metadata.name],
    }));
  };
  const toggleSelectAll = () =>
    setSelected((s) => {
      const c = { ...s };
      if (allSel) {
        nonRunning.forEach((wf) => delete c[wf.metadata.name]);
      } else {
        nonRunning.forEach((wf) => (c[wf.metadata.name] = true));
      }
      return c;
    });

  /* delete handlers */
  const handleSingleDelete = async (name) => {
    if (!window.confirm(`Delete workflow “${name}”?`)) return;
    try {
      await deleteWorkflow(name);
      setItems((it) => it.filter((w) => w.metadata.name !== name));
    } catch (e) {
      onError(`Failed to delete: ${e.message}`);
    }
  };
  const handleBatchDelete = async () => {
    const names = Object.keys(selected).filter((n) => selected[n]);
    try {
      await deleteWorkflows(names);
      setItems((it) => it.filter((w) => !names.includes(w.metadata.name)));
      setConfirmNames(null);
      setSelected({});
    } catch (e) {
      onError(`Batch delete failed: ${e.message}`);
    }
  };

  /* group workflows by template */
  const grouped = filteredItems.reduce((acc, wf) => {
    const key =
      wf.spec?.workflowTemplateRef?.name ||
      wf.metadata.generateName ||
      "Unlabelled";
    (acc[key] = acc[key] || []).push(wf);
    return acc;
  }, {});
  const groups = Object.entries(grouped).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  /* render */
  return (
    <div className="wf-container">
      <h2 style={{ paddingLeft: "1rem" }}>Workflows</h2>

      {/* full-width, limited-height filter panel */}
      <div className="label-filters">
        {Object.entries(labelGroups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([displayKey, entries]) => (
            <details
              key={displayKey}
              open={!collapsedSet.has(displayKey)}
            >
              <summary>{displayKey}</summary>
              <div className="label-values">
                {entries.map(({ value, fullKey }) => {
                  const pair = `${fullKey}=${value}`;
                  const on = !!filters[pair];
                  return (
                    <span
                      key={pair}
                      onClick={() => toggleFilter(pair)}
                    >
                      {value}
                    </span>
                  );
                })}
              </div>
            </details>
          ))}
      </div>

      {/* bulk-delete button */}
      {Object.values(selected).filter(Boolean).length > 0 && (
        <div style={{ margin: "0.5rem 1rem" }}>
          <button
            className="btn-danger"
            onClick={() =>
              setConfirmNames(
                Object.keys(selected).filter((n) => selected[n])
              )
            }
          >
            Delete selected
          </button>
        </div>
      )}

      {/* workflow tables */}
      {groups.map(([groupName, list]) => (
        <section key={groupName} style={{ marginBottom: "1rem" }}>
          <h3 className="wf-group-title">{groupName}</h3>
          <table className="wf-table">
            <thead>
              <tr>
                <th style={{ width: "4rem" }}>
                  <input
                    type="checkbox"
                    checked={allSel}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Name</th>
                <th>Start Time</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list
                .sort(
                  (a, b) =>
                    new Date(b.status.startedAt) -
                    new Date(a.status.startedAt)
                )
                .map((wf) => {
                  const nm = wf.metadata.name;
                  const del = !isRunning(wf);
                  return (
                    <tr key={nm}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!selected[nm]}
                          disabled={!del}
                          onChange={() => toggleRow(wf)}
                        />
                      </td>
                      <td>{nm}</td>
                      <td>
                        {new Date(wf.status.startedAt).toLocaleString()}
                      </td>
                      <td>{wf.status.phase}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          className="btn"
                          onClick={() => onShowLogs(nm)}
                        >
                          Logs
                        </button>
                        {del && (
                          <button
                            className="btn-danger"
                            onClick={() => handleSingleDelete(nm)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      ))}

      {/* batch-delete confirmation */}
      {confirmNames && (
        <DeleteConfirmModal
          names={confirmNames}
          onConfirm={handleBatchDelete}
          onCancel={() => setConfirmNames(null)}
        />
      )}
    </div>
  );
}
