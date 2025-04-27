// src/client/src/components/WorkflowList.jsx
import React, { useEffect, useState, useMemo } from "react";
import { listWorkflows, deleteWorkflow, deleteWorkflows } from "../api";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

// read comma-separated skip-keys from Vite env
const skipKeysEnv = import.meta.env.VITE_SKIP_LABELS || "";
const skipKeys = skipKeysEnv
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

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

  /* collect all key=value pairs, skipping unwanted keys */
  const allLabelPairs = useMemo(() => {
    const s = new Set();
    items.forEach((wf) => {
      Object.entries(wf.metadata.labels || {}).forEach(([k, v]) => {
        if (!skipKeys.includes(k)) {
          s.add(`${k}=${v}`);
        }
      });
    });
    return Array.from(s).sort();
  }, [items]);

  const toggleFilter = (pair) =>
    setFilters((f) => ({ ...f, [pair]: !f[pair] }));

  /* apply filters: must have every selected key=value */
  const active = Object.entries(filters)
    .filter(([, on]) => on)
    .map(([pair]) => pair);

  const filteredItems =
    active.length === 0
      ? items
      : items.filter((wf) =>
          active.every((pair) => {
            const [k, v] = pair.split("=");
            return wf.metadata.labels?.[k] === v;
          })
        );

  /* selection logic (unchanged) */
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

  /* delete handlers (unchanged) */
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

  /* group by template (unchanged) */
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

  return (
    <div className="wf-container">
      <h2 style={{ paddingLeft: "1rem" }}>Workflows</h2>

      {/* label=value filter bar */}
      <div style={{ padding: "0 1rem", marginBottom: "1rem" }}>
        {allLabelPairs.map((pair) => {
          const on = !!filters[pair];
          return (
            <span
              key={pair}
              onClick={() => toggleFilter(pair)}
              style={{
                display: "inline-block",
                margin: "0 .5rem .5rem 0",
                padding: "0.25rem .5rem",
                borderRadius: "4px",
                cursor: "pointer",
                background: "var(--bg)",
                opacity: on ? 1 : 0.4,
                transition: "opacity .2s",
              }}
            >
              {pair}
            </span>
          );
        })}
      </div>

      {/* bulk-delete button */}
      {Object.values(selected).filter(Boolean).length > 0 && (
        <div style={{ margin: "0.5rem 1rem" }}>
          <button
            className="btn-danger"
            onClick={() => setConfirmNames(
              Object.keys(selected).filter((n) => selected[n])
            )}
          >
            Delete selected
          </button>
        </div>
      )}

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
