// src/client/src/components/WorkflowList.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  listWorkflows,
  deleteWorkflow,
  deleteWorkflows,
} from "../api";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";

/* ------------------------------------------------------------------ */
/*  Runtime env                                                        */
/* ------------------------------------------------------------------ */
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
    if (p.includes("=")) return p === `${k}=${v}`;
    // skip if raw key or trimmed key matches
    return p === k || p === displayKey;
  });
};

/* ------------------------------------------------------------------ */
/*  UTC helper – “YYYY-MM-DD HH:MM:SS”                                 */
/* ------------------------------------------------------------------ */
function fmtUtc(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function WorkflowList({ onShowLogs, onError = () => {} }) {
  const [items, setItems]               = useState([]);
  const [selected, setSelected]         = useState({});
  const [confirmNames, setConfirmNames] = useState(null);
  const [filters, setFilters]           = useState({});
  const [sort, setSort]                 = useState({ column: "template", dir: "asc" });

  /* ---------------- fetch + auto-refresh ------------------------- */
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

  /* ---------------- compute label filter values ------------------ */
  const labelGroups = useMemo(() => {
    const groups = new Map();
    items.forEach((wf) => {
      const labels = wf.metadata.labels || {};
      Object.entries(labels).forEach(([k, v]) => {
        if (shouldSkip(k, v)) return;
        const dk = trimKey(k);
        if (!groups.has(dk)) groups.set(dk, []);
        groups.get(dk).push({ fullKey: k, value: v });
      });
    });
    // dedupe
    for (const [dk, entries] of groups) {
      const seen = new Set();
      const uniq = [];
      entries.forEach((e) => {
        const key = `${e.fullKey}=${e.value}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniq.push(e);
        }
      });
      uniq.length ? groups.set(dk, uniq) : groups.delete(dk);
    }
    return groups;
  }, [items]);

  /* ---------------- derive rows (flatten) ------------------------ */
  const rows = useMemo(
    () =>
      items.map((wf) => ({
        wf,
        group:
          wf.spec?.workflowTemplateRef?.name ||
          wf.metadata.generateName ||
          "Unlabelled",
      })),
    [items]
  );

  /* ---------------- active filters ------------------------------- */
  const activePairs = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([p]) => p);

  const filteredRows = useMemo(() => {
    if (!activePairs.length) return rows;
    return rows.filter(({ wf }) =>
      activePairs.some((pair) => {
        const [k, v] = pair.split("=");
        return wf.metadata.labels?.[k] === v;
      })
    );
  }, [rows, activePairs]);

  /* ---------------- sorting -------------------------------------- */
  const comparator = (a, b) => {
    const { column, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;

    /* helpers */
    const tKey = (r) =>
      r.group; // template key already prepared
    const sTime = (r) => new Date(r.wf.status.startedAt).getTime();

    switch (column) {
      case "name":
        return mul * (a.wf.metadata.name.localeCompare(b.wf.metadata.name));
      case "start":
        return mul * (sTime(a) - sTime(b));
      case "status":
        return mul * (a.wf.status.phase.localeCompare(b.wf.status.phase));
      /* template: tie-break by start time DESC                       */
      default:
        if (tKey(a) !== tKey(b)) return mul * tKey(a).localeCompare(tKey(b));
        return -sTime(a) + sTime(b); // newest first
    }
  };

  const sortedRows = useMemo(
    () => [...filteredRows].sort(comparator),
    [filteredRows, sort]
  );

  /* ---------------- selection helpers ---------------------------- */
  const isRunning = (wf) => wf.status.phase === "Running";
  const nonRunning = sortedRows
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

  /* ---------------- delete handlers ------------------------------ */
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

  /* ---------------- JSX ------------------------------------------ */
  const nextDir = (col) =>
    sort.column === col ? (sort.dir === "asc" ? "desc" : "asc") : "asc";

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

      {/* Table */}
      <table className="wf-table intimate">
        <thead>
          <tr>
            <th
              style={{ cursor: "pointer" }}
              title="Sort by template name (A→Z), then newest start time"
              onClick={() => setSort({ column: "template", dir: nextDir("template") })}
            >
              Template
            </th>
            <th style={{ width: "4rem" }}>
              <input type="checkbox" checked={allSel} onChange={toggleSelectAll} />
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "name", dir: nextDir("name") })}
            >
              Name
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "start", dir: nextDir("start") })}
            >
              Start&nbsp;Time&nbsp;(UTC)
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "status", dir: nextDir("status") })}
            >
              Status
            </th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {sortedRows.map(({ wf, group }) => {
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
                  style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
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
                  style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {nm}
                </td>
                <td>{fmtUtc(wf.status.startedAt)}</td>
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

      {/* Confirm delete modal */}
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
