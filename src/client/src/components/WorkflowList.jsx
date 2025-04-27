import React, { useEffect, useState, useMemo } from "react";
import {
  listWorkflows,
  deleteWorkflow,
  deleteWorkflows,
} from "../api";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

// ─── Runtime config pulled from env.js at runtime ──────────────────
const env = window.__ENV__ || {};

const rawSkip = (env.skipLabels || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const trimPrefixes = (env.labelPrefixTrim || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const shouldSkip = (k, v) =>
  rawSkip.some((p) =>
    p.includes("=") ? p === `${k}=${v}` : p === k
  );

const trimKey = (k) => {
  for (const pref of trimPrefixes) {
    if (k.startsWith(pref)) return k.slice(pref.length);
  }
  return k;
};

export default function WorkflowList({ onShowLogs, onError = () => {} }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [confirmNames, setConfirmNames] = useState(null);
  const [filters, setFilters] = useState({});

  // fetch + auto-refresh
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

  // collect and group labels by trimmed key
  const labelGroups = useMemo(() => {
    const g = {};
    items.forEach((wf) => {
      Object.entries(wf.metadata.labels || {}).forEach(([k, v]) => {
        if (shouldSkip(k, v)) return;
        const dk = trimKey(k);
        if (!g[dk]) g[dk] = new Map();
        g[dk].set(v, k);
      });
    });
    return Object.fromEntries(
      Object.entries(g).map(([dk, map]) => [
        dk,
        Array.from(map.entries())
          .map(([value, fullKey]) => ({ value, fullKey }))
          .sort((a, b) => a.value.localeCompare(b.value)),
      ])
    );
  }, [items]);

  // toggle a single filter
  const toggleFilter = (pair) =>
    setFilters((f) => ({ ...f, [pair]: !f[pair] }));
  const active = Object.entries(filters)
    .filter(([, on]) => on)
    .map(([p]) => p);

  // always OR (match any)
  const filteredItems = useMemo(() => {
    if (active.length === 0) return items;
    return items.filter((wf) =>
      active.some((pair) => {
        const [k, v] = pair.split("=");
        return wf.metadata.labels?.[k] === v;
      })
    );
  }, [items, active]);

  // selection logic
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

  // delete handlers
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

  // group workflows by template
  const groups = useMemo(() => {
    const m = {};
    filteredItems.forEach((wf) => {
      const key =
        wf.spec?.workflowTemplateRef?.name ||
        wf.metadata.generateName ||
        "Unlabelled";
      ;(m[key] = m[key] || []).push(wf);
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  return (
    <div className="wf-container">
      <h2 style={{ paddingLeft: "1rem" }}>Workflows</h2>

      {/* entire filter panel, collapsed by default */}
      <details className="filter-panel">
        <summary className="filter-title">Filters</summary>
        <div className="label-filters">
          {Object.entries(labelGroups).map(([dk, entries]) => (
            <details key={dk}>
              <summary>{dk}</summary>
              <div className="label-values">
                {entries.map(({ value, fullKey }) => {
                  const pair = `${fullKey}=${value}`;
                  return (
                    <span
                      key={pair}
                      className={filters[pair] ? "selected" : ""}
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
      </details>

      {/* bulk-delete button */}
      {Object.values(selected).some(Boolean) && (
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

      {/* grouped workflow tables */}
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

      {/* delete confirmation modal */}
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
