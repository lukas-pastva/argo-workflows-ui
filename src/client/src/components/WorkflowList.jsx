// src/client/src/components/WorkflowList.jsx
import React, { useEffect, useState, useMemo } from "react";
import {
  listWorkflows,
  deleteWorkflow,
  deleteWorkflows,
} from "../api";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

// runtime config from env.js
const env = window.__ENV__ || {};

const rawSkip = (env.skipLabels || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const trimPrefixes = (env.labelPrefixTrim || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const trimKey = (k) => {
  for (const pref of trimPrefixes) {
    if (k.startsWith(pref)) return k.slice(pref.length);
  }
  return k;
};

const shouldSkip = (k, v) => {
  const displayKey = trimKey(k);
  return rawSkip.some((p) => {
    if (p.includes("=")) {
      return p === `${k}=${v}`;
    } else {
      // skip if raw key or trimmed key matches
      return p === k || p === displayKey;
    }
  });
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
    const id = setInterval(fetchAll, 10000);
    return () => clearInterval(id);
  }, [onError]);

  // compute labelGroups: Map<displayKey, Array<{ fullKey, value }>>
  const labelGroups = useMemo(() => {
    const groups = new Map();
    items.forEach((wf) => {
      const labels = wf.metadata.labels || {};
      Object.entries(labels).forEach(([k, v]) => {
        if (shouldSkip(k, v)) return;
        const displayKey = trimKey(k);
        if (!groups.has(displayKey)) groups.set(displayKey, []);
        groups.get(displayKey).push({ fullKey: k, value: v });
      });
    });
    // dedupe entries in each group, drop empty
    for (const [displayKey, entries] of groups) {
      const seen = new Set();
      const uniq = [];
      entries.forEach((e) => {
        const pair = `${e.fullKey}=${e.value}`;
        if (!seen.has(pair)) {
          seen.add(pair);
          uniq.push(e);
        }
      });
      if (uniq.length > 0) {
        groups.set(displayKey, uniq);
      } else {
        groups.delete(displayKey);
      }
    }
    return groups;
  }, [items]);

  // group + sort by template ASC, then by start time DESC
  const grouped = useMemo(() => {
    // first, sort the flat list by [template, -startedAt]
    const sorted = [...items].sort((a, b) => {
      const aKey = a.spec?.workflowTemplateRef?.name
        || a.metadata.generateName
        || "";
      const bKey = b.spec?.workflowTemplateRef?.name
        || b.metadata.generateName
        || "";
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      // same template → newest first
      return new Date(b.status.startedAt) - new Date(a.status.startedAt);
    });

    // then group in that exact order
    const m = new Map();
    sorted.forEach((wf) => {
      const key =
        wf.spec?.workflowTemplateRef?.name ||
        wf.metadata.generateName ||
        "Unlabelled";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(wf);
    });
    return Array.from(m.entries());
  }, [items]);

  // flatten into rows: [{ wf, group }]
  const rows = useMemo(() => {
    const r = [];
    grouped.forEach(([group, list]) => {
      list.forEach((wf) => {
        r.push({ wf, group });
      });
    });
    return r;
  }, [grouped]);

  // derive active filter pairs
  const active = Object.entries(filters)
    .filter(([, on]) => on)
    .map(([p]) => p);

  // filter rows by active labels (OR logic)
  const filteredRows = useMemo(() => {
    if (active.length === 0) return rows;
    return rows.filter(({ wf }) =>
      active.some((pair) => {
        const [k, v] = pair.split("=");
        return wf.metadata.labels?.[k] === v;
      })
    );
  }, [rows, active]);

  // selection logic
  const isRunning = (wf) => wf.status.phase === "Running";
  const nonRunning = filteredRows
    .map((r) => r.wf)
    .filter((wf) => !isRunning(wf));
  const allSel =
    nonRunning.length > 0 &&
    nonRunning.every((wf) => selected[wf.metadata.name]);

  const toggleRow = (wf) => {
    if (isRunning(wf)) return;
    setSelected((s) => ({ ...s, [wf.metadata.name]: !s[wf.metadata.name] }));
  };
  const toggleSelectAll = () => {
    setSelected((s) => {
      const c = { ...s };
      if (allSel) {
        nonRunning.forEach((wf) => delete c[wf.metadata.name]);
      } else {
        nonRunning.forEach((wf) => (c[wf.metadata.name] = true));
      }
      return c;
    });
  };

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

  return (
    <div className="wf-container">
      <h2 style={{ paddingLeft: "1rem" }}>Workflows</h2>

      {/* Filter panel */}
      <details className="filter-panel">
        <summary className="filter-title">Filters</summary>
        <div className="label-filters">
          {Array.from(labelGroups.entries()).map(([dk, entries]) => (
            <details key={dk}>
              <summary>{dk}</summary>
              <div className="label-values">
                {entries.map(({ fullKey, value }) => {
                  const pair = `${fullKey}=${value}`;
                  return (
                    <span
                      key={pair}
                      className={filters[pair] ? "selected" : ""}
                      onClick={() =>
                        setFilters((f) => ({ ...f, [pair]: !f[pair] }))
                      }
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

      {/* Bulk delete */}
      {Object.values(selected).some(Boolean) && (
        <div style={{ margin: "0.5rem 1rem" }}>
          <button
            className="btn-danger"
            onClick={() =>
              setConfirmNames(Object.keys(selected).filter((n) => selected[n]))
            }
          >
            Delete selected
          </button>
        </div>
      )}

      {/* Workflows table */}
      <table className="wf-table intimate">
        <thead>
          <tr>
            <th>Template</th>
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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.map(({ wf, group }) => {
            const nm = wf.metadata.name;
            const delOk = !isRunning(wf);
            return (
              <tr
                key={nm}
                onClick={() => onShowLogs(nm)}
                style={{ cursor: "pointer" }}
              >
                <td
                  className="group-col"
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {group}
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!selected[nm]}
                    disabled={!delOk}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRow(wf);
                    }}
                  />
                </td>
                <td
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {nm}
                </td>
                <td>{new Date(wf.status.startedAt).toLocaleString()}</td>
                <td>{wf.status.phase}</td>
                <td>
                  <button
                    className="btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowLogs(nm);
                    }}
                  >
                    Logs
                  </button>
                  {delOk && (
                    <button
                      className="btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSingleDelete(nm);
                      }}
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

      {/* Delete confirm modal */}
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
