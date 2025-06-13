import React, { useEffect, useMemo, useState } from "react";
import {
  listWorkflows,
  deleteWorkflow,
  deleteWorkflows,
} from "../api";
import DeleteConfirmModal   from "./DeleteConfirmModal.jsx";
import FailureReasonModal   from "./FailureReasonModal.jsx";
import Spinner              from "./Spinner.jsx";

/* ------------------------------------------------------------------ */
/*  Runtime env                                                       */
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
    return p === k || p === displayKey;
  });
};

/* ------------------------------------------------------------------ */
/*  Local-time helper – browser TZ, locale-aware                      */
/* ------------------------------------------------------------------ */
function fmtLocal(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function WorkflowList({ onShowLogs, onError = () => {} }) {
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState({});
  const [confirmNames, setConfirmNames] = useState(null);
  const [expanded, setExpanded]         = useState({});
  const [reasonModal, setReasonModal]   = useState(null);

  /* ---- load & persist label filters ---------------------------- */
  const [filters, setFilters] = useState(() => {
    try {
      const saved = localStorage.getItem("workflowFilters");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("workflowFilters", JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);

  /* --- DEFAULT SORT: by start-time (most-recent first) ---------- */
  const [sort, setSort] = useState({ column: "start", dir: "desc" });

  /* ---------------- fetch list (auto-refresh) ------------------ */
  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true);
        setItems(await listWorkflows());
      } catch (e) {
        onError(
          e.status === 403
            ? "Access denied (HTTP 403)."
            : `Error loading workflows: ${e.message}`
        );
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
    const id = setInterval(fetchAll, 10_000);
    return () => clearInterval(id);
  }, [onError]);

  /* ---------------- build label filter groups ------------------ */
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
    /* de-duplicate values */
    for (const [dk, entries] of groups) {
      const seen = new Set();
      groups.set(
        dk,
        entries.filter((e) => {
          const key = `${e.fullKey}=${e.value}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      );
    }
    return groups;
  }, [items]);

  /* ---------------- flatten rows ------------------------------- */
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

  /* ------------------------------------------------------------------
      Label filtering
      ----------------------------------------------------------------- */
  const activePairs = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([p]) => p);
  const hasActiveFilters = activePairs.length > 0;

  const keyToValues = useMemo(() => {
    const m = new Map();
    activePairs.forEach((pair) => {
      const [k, v] = pair.split("=");
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(v);
    });
    return m;
  }, [activePairs]);

  const filteredRows = useMemo(() => {
    if (!hasActiveFilters) return rows;

    return rows.filter(({ wf }) => {
      const labels = wf.metadata.labels || {};
      for (const [k, values] of keyToValues) {
        const labelVal = labels[k];
        if (!values.has(labelVal)) return false;
      }
      return true;
    });
  }, [rows, keyToValues, hasActiveFilters]);

  /* ---------------- sorting ------------------------------------ */
  const comparator = (a, b) => {
    const { column, dir } = sort;
    const mul  = dir === "asc" ? 1 : -1;
    const gKey = (r) => r.group;
    const sTime= (r) => new Date(r.wf.status.startedAt).getTime();

    switch (column) {
      case "name":
        return mul * a.wf.metadata.name.localeCompare(b.wf.metadata.name);
      case "start":
        return mul * (sTime(a) - sTime(b));
      case "status":
        return mul * a.wf.status.phase.localeCompare(b.wf.status.phase);
      default:
        if (gKey(a) !== gKey(b)) return mul * gKey(a).localeCompare(gKey(b));
        return -sTime(a) + sTime(b); /* newest-first inside each template */
    }
  };
  const sortedRows = useMemo(
    () => [...filteredRows].sort(comparator),
    [filteredRows, sort]
  );

  /* ---------------- bulk-selection helpers --------------------- */
  const isRunning  = (wf) => wf.status.phase === "Running";
  const nonRunning = sortedRows.map((r) => r.wf).filter((wf) => !isRunning(wf));
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
        nonRunning.forEach((wf) => {
          c[wf.metadata.name] = true;
        });
      }
      return c;
    });
  };

  /* ---------------- delete helpers ----------------------------- */
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

  /* ---------------- expanded-row helpers ----------------------- */
  const toggleExpanded = (name, e) => {
    e.stopPropagation(); /* keep row click (logs) untouched */
    setExpanded((ex) => ({ ...ex, [name]: !ex[name] }));
  };

  /* ---------------- sort-indicator helper ---------------------- */
  const sortIndicator = (col) =>
    sort.column === col ? (sort.dir === "asc" ? " ▲" : " ▼") : "";

  /* ---------------- render ------------------------------------- */
  const clearFilters = () => setFilters({});
  const nextDir = (col) =>
    sort.column === col ? (sort.dir === "asc" ? "desc" : "asc") : "asc";

  return (
    <div className="wf-container">
      <h3 className="wf-title">List</h3>

      {/* ─── Global spinner while fetching first list ───────────── */}
      {loading && items.length === 0 && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <Spinner />
        </div>
      )}

      {/* ─── Filter panel ───────────────────────────────────────── */}
      <details className="filter-panel">
        <summary className="filter-title">
          Filters{hasActiveFilters ? " ✓" : ""}
        </summary>

        {/* clear-filters button */}
        <button
          className="btn-light"
          disabled={!hasActiveFilters}
          style={{ margin: "0.5rem 1rem" }}
          onClick={clearFilters}
        >
          Clear filters
        </button>

        <div className="label-filters">
          {Array.from(labelGroups.entries()).map(([dk, entries]) => {
            const hasSelected = entries.some(
              ({ fullKey, value }) => filters[`${fullKey}=${value}`]
            );

            return (
              <details key={dk}>
                <summary className={hasSelected ? "selected" : ""}>{dk}</summary>

                <div className="label-values">
                  {entries.map(({ fullKey, value }) => {
                    const pair = `${fullKey}=${value}`;
                    return (
                      <span
                        key={pair}
                        className={filters[pair] ? "selected" : ""}
                        onClick={() =>
                          setFilters((f) => ({ ...f, [pair]: !f[pair] }))}
                      >
                        {value}
                      </span>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </details>

      {/* ─── Bulk-delete button ────────────────────────────────── */}
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

      {/* ─── Main table ────────────────────────────────────────── */}
      <table className="wf-table intimate">
        <thead>
          <tr>
            <th
              style={{ cursor: "pointer" }}
              title="Sort by template name"
              onClick={() =>
                setSort({ column: "template", dir: nextDir("template") })
              }
            >
              {`Template${sortIndicator("template")}`}
            </th>
            <th style={{ width: "4rem" }}>
              <input type="checkbox" checked={allSel} onChange={toggleSelectAll} />
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "name", dir: nextDir("name") })}
            >
              {`Name${sortIndicator("name")}`}
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "start", dir: nextDir("start") })}
            >
              {`Start Time${sortIndicator("start")}`}
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() =>
                setSort({ column: "status", dir: nextDir("status") })
              }
            >
              {`Status${sortIndicator("status")}`}
            </th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {sortedRows.map(({ wf, group }) => {
            const nm     = wf.metadata.name;
            const delOk  = !isRunning(wf);
            const labels = wf.metadata.labels || {};

            const failureMsg =
              wf.status?.message ||
              wf.status?.conditions?.find((c) => c.type === "Failed")?.message ||
              "No reason recorded";

            return (
              /* ─────────────── Main workflow row ─────────────── */
              <React.Fragment key={nm}>
                <tr onClick={() => onShowLogs(nm)} style={{ cursor: "pointer" }}>
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
                  <td>{fmtLocal(wf.status.startedAt)}</td>

                  {/* ─── Status pill (unchanged) ───────────────── */}
                  <td>
                    {wf.status.phase === "Failed" ? (
                      <span
                        className="status-pill status-failed"
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setReasonModal({ name: nm, reason: failureMsg });
                        }}
                        title="Failed – click to view reason"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </span>
                    ) : wf.status.phase === "Succeeded" ? (
                      <span
                        className="status-pill status-succeeded"
                        title="Succeeded"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    ) : (
                      wf.status.phase
                    )}
                  </td>

                  {/* ─── NEW: icon-only action buttons ─────────── */}
                  <td>
                    {/* Logs */}
                    <button
                      className="btn"
                      aria-label="Logs"
                      style={{ padding: "0.35rem" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowLogs(nm);
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16l4-4h6a2 2 0 0 0 2-2V2z" />
                        <line x1="9" y1="9" x2="13" y2="9" />
                        <line x1="9" y1="13" x2="13" y2="13" />
                      </svg>
                    </button>

                    {/* Labels */}
                    <button
                      className="btn-light"
                      aria-label="Labels"
                      style={{ padding: "0.35rem" }}
                      onClick={(e) => toggleExpanded(nm, e)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20.59 13.41L11 4 4 11l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z" />
                        <line x1="7" y1="10" x2="7" y2="10" />
                      </svg>
                    </button>

                    {/* Delete */}
                    <button
                      className="btn-danger"
                      aria-label="Delete"
                      style={{ padding: "0.35rem" }}
                      disabled={!delOk}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSingleDelete(nm);
                      }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-2 14H7L5 6" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                        <path d="M5 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>

                {/* ─────────────── Expanded label row ─────────────── */}
                {expanded[nm] && (
                  <tr className="tr-labels">
                    <td colSpan={6}>
                      <div className="wf-labels-list">
                        {Object.entries(labels).map(([k, v]) => (
                          <code key={k} title={k}>
                            <strong>{trimKey(k)}</strong>=<span>{v}</span>
                          </code>
                        ))}
                        {Object.keys(labels).length === 0 && (
                          <em>No labels</em>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* ─── Confirm-delete modal ──────────────────────────────── */}
      {confirmNames && (
        <DeleteConfirmModal
          names={confirmNames}
          onConfirm={handleBatchDelete}
          onCancel={() => setConfirmNames(null)}
        />
      )}

      {/* ─── Failure-reason modal ──────────────────────────────── */}
      {reasonModal && (
        <FailureReasonModal
          name={reasonModal.name}
          reason={reasonModal.reason}
          onClose={() => setReasonModal(null)}
        />
      )}
    </div>
  );
}
