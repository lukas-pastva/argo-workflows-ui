// src/client/src/components/WorkflowList.jsx
import React, { useEffect, useState, useMemo } from "react";
import { listWorkflows, deleteWorkflow, deleteWorkflows } from "../api";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

// Read comma-separated skip-labels from Vite env (set via VITE_SKIP_LABELS)
const skipLabelsEnv = import.meta.env.VITE_SKIP_LABELS || "";
const skipLabels = skipLabelsEnv
  .split(",")
  .map((l) => l.trim())
  .filter((l) => l);

export default function WorkflowList({ onShowLogs, onError = () => {} }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [confirmNames, setConfirmNames] = useState(null);
  const [labelFilters, setLabelFilters] = useState({});

  /* -------------- fetch / auto-refresh ---------------------------- */
  useEffect(() => {
    async function fetchAll() {
      try {
        setItems(await listWorkflows());
      } catch (e) {
        onError(
          e.status === 403
            ? "Access denied – this service-account isn’t authorised to list workflows (HTTP 403)."
            : `Error loading workflows: ${e.message}`
        );
      }
    }
    fetchAll();
    const id = setInterval(fetchAll, 10_000);
    return () => clearInterval(id);
  }, [onError]);

  /* -------------- compute all non-skipped labels ------------------ */
  const allLabels = useMemo(() => {
    const setLabels = new Set();
    items.forEach((wf) => {
      const labels = wf.metadata.labels || {};
      Object.keys(labels).forEach((key) => {
        if (!skipLabels.includes(key)) {
          setLabels.add(key);
        }
      });
    });
    return Array.from(setLabels).sort();
  }, [items]);

  const toggleLabel = (label) => {
    setLabelFilters((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  /* -------------- filter items by selected labels --------------- */
  const activeFilters = Object.entries(labelFilters)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const filteredItems =
    activeFilters.length > 0
      ? items.filter((wf) => {
          const wfLabels = wf.metadata.labels || {};
          // require *all* selected filters to be present
          return activeFilters.every((f) => wfLabels[f] !== undefined);
        })
      : items;

  /* -------------- selection / deletion logic --------------------- */
  const isRunning = (wf) => wf.status.phase === "Running";
  const isSelected = (name) => selected[name];
  const nonRunning = filteredItems.filter((wf) => !isRunning(wf));
  const allSelected =
    nonRunning.length &&
    nonRunning.every((wf) => isSelected(wf.metadata.name));

  const toggleRow = (wf) => {
    if (isRunning(wf)) return;
    setSelected((p) => ({
      ...p,
      [wf.metadata.name]: !p[wf.metadata.name],
    }));
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const copy = { ...prev };
      if (allSelected) {
        nonRunning.forEach((wf) => delete copy[wf.metadata.name]);
      } else {
        nonRunning.forEach((wf) => (copy[wf.metadata.name] = true));
      }
      return copy;
    });
  };

  const handleSingleDelete = async (name) => {
    if (!window.confirm(`Delete workflow “${name}”?`)) return;
    try {
      await deleteWorkflow(name);
      setItems((p) => p.filter((w) => w.metadata.name !== name));
    } catch (e) {
      onError(`Failed to delete workflow: ${e.message}`);
    }
  };

  const handleBatchDelete = async () => {
    try {
      await deleteWorkflows(confirmNames);
      setItems((p) =>
        p.filter((w) => !confirmNames.includes(w.metadata.name))
      );
      setConfirmNames(null);
      setSelected((p) => {
        const copy = { ...p };
        confirmNames.forEach((n) => delete copy[n]);
        return copy;
      });
    } catch (e) {
      onError(`Failed to delete workflows: ${e.message}`);
    }
  };

  /* -------------------- grouping by templateRef ------------------- */
  const grouped = filteredItems.reduce((acc, wf) => {
    const key =
      wf.spec?.workflowTemplateRef?.name ||
      wf.metadata.generateName ||
      "Unlabelled";
    (acc[key] = acc[key] || []).push(wf);
    return acc;
  }, {});
  const groupEntries = Object.entries(grouped).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const selectedNames = Object.keys(selected).filter((k) => selected[k]);

  /* -------------------- render ------------------------------------ */
  return (
    <div className="wf-container">
      <h2 style={{ paddingLeft: "1rem" }}>Workflows</h2>

      {/* Label-based filter UI */}
      <div style={{ padding: "0 1rem", marginBottom: "1rem" }}>
        {allLabels.map((label) => {
          const on = !!labelFilters[label];
          return (
            <span
              key={label}
              onClick={() => toggleLabel(label)}
              style={{
                display: "inline-block",
                marginRight: "0.5rem",
                marginBottom: "0.5rem",
                padding: "0.25rem 0.5rem",
                borderRadius: "4px",
                background: "var(--bg)",
                cursor: "pointer",
                opacity: on ? 1 : 0.5,
                transition: "opacity 0.2s ease",
              }}
            >
              {label}
            </span>
          );
        })}
      </div>

      {selectedNames.length > 0 && (
        <div style={{ margin: "0.5rem 1rem" }}>
          <button
            className="btn-danger"
            onClick={() => setConfirmNames(selectedNames)}
          >
            Delete selected ({selectedNames.length})
          </button>
        </div>
      )}

      {groupEntries.map(([groupName, list]) => (
        <section key={groupName} style={{ marginBottom: "1rem" }}>
          <h3 className="wf-group-title">{groupName}</h3>

          <table className="wf-table">
            <thead>
              <tr>
                <th style={{ width: "4rem" }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="select all deletable"
                  />
                </th>
                <th>Name</th>
                <th style={{ width: "18rem" }}>Start Time</th>
                <th style={{ width: "9rem" }}>Status</th>
                <th style={{ width: "11rem" }} />
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
                  const name = wf.metadata.name;
                  const deletable = !isRunning(wf);
                  return (
                    <tr key={name}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!selected[name]}
                          disabled={!deletable}
                          onChange={() => toggleRow(wf)}
                          aria-label={`select ${name}`}
                        />
                      </td>
                      <td>{name}</td>
                      <td>
                        {new Date(wf.status.startedAt).toLocaleString()}
                      </td>
                      <td>{wf.status.phase}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          className="btn"
                          style={{ marginRight: "0.5rem" }}
                          onClick={() => onShowLogs(name)}
                        >
                          Logs
                        </button>
                        {deletable && (
                          <button
                            className="btn-danger"
                            onClick={() => handleSingleDelete(name)}
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
