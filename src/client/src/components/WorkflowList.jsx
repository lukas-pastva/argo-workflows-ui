import React, { useEffect, useMemo, useState } from "react";
import {
  listWorkflowsPaged,
  listWorkflows,      // used for suggestions in Trigger; keep available
  deleteWorkflow,
  deleteWorkflows,
} from "../api";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";
import FailureReasonModal from "./FailureReasonModal.jsx";
import Spinner            from "./Spinner.jsx";
import MiniDag            from "./MiniDag.jsx";

/* ------------------------------------------------------------------ */
/*  Runtime env & helpers                                             */
/* ------------------------------------------------------------------ */
const env = window.__ENV__ || {};

/* choose between browser-local (default) and UTC */
const useUtcTime =
  String(env.useUtcTime ?? import.meta.env.VITE_USE_UTC_TIME ?? "")
    .toLowerCase()
    .trim() === "true";

const rawSkip = (env.skipLabels || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const trimPrefixes = (env.labelPrefixTrim || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

/* list of label keys that become table columns */
const listLabelColumns = (env.listLabelColumns || "")
  .split(",")
  .map((s) => s.trim())
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
/*  Timestamp & duration helpers                                      */
/* ------------------------------------------------------------------ */
function fmtTime(ts) {
  const d = new Date(ts);
  return useUtcTime
    ? d.toLocaleString("en-GB", {
        hour12 : false,
        timeZone: "UTC",
      }).replace(",", "") + " UTC"
    : d.toLocaleString(undefined, { hour12: false });
}

function durationSeconds(wf) {
  const start = new Date(wf.status.startedAt).getTime();
  const end   = wf.status.finishedAt
    ? new Date(wf.status.finishedAt).getTime()
    : Date.now();
  return Math.max(0, Math.round((end - start) / 1000));
}

function fmtDuration(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function WorkflowList({ onShowLogs, onError = () => {} }) {
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState({});
  const [confirmNames, setConfirmNames] = useState(null);
  const [expanded, setExpanded]         = useState({});
  const [reasonModal, setReasonModal]   = useState(null);

  /* ---- paging state --------------------------------------------- */
  const [pageSize, setPageSize]   = useState(100);
  const [cursor, setCursor]       = useState("");     // current cursor (continue token for this page)
  const [nextCursor, setNextCursor] = useState(null); // next token if available
  const [cursorStack, setCursorStack] = useState([]); // stack of previous cursors for "Prev"
  const [pageNum, setPageNum]     = useState(1);

  /* ---- label filters (persisted) -------------------------------- */
  const [filters, setFilters] = useState(() => {
    try { return JSON.parse(localStorage.getItem("workflowFilters") || "{}"); }
    catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("workflowFilters", JSON.stringify(filters)); }
    catch {/* ignore */ }
  }, [filters]);

  /* ---- sort ----------------------------------------------------- */
  const [sort, setSort] = useState({ column: "start", dir: "desc" });

  /* ---- fetch list (auto-refresh current page) ------------------- */
  useEffect(() => {
    let cancelled = false;

    async function fetchPage() {
      try {
        setLoading(true);
        const res = await listWorkflowsPaged({ limit: pageSize, cursor });
        if (cancelled) return;
        setItems(res.items || []);
        setNextCursor(res.nextCursor || null);
      } catch (e) {
        if (!cancelled) {
          onError(
            e.status === 403
              ? "Access denied (HTTP 403)."
              : `Error loading workflows: ${e.message}`
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPage();
    const id = setInterval(fetchPage, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [onError, pageSize, cursor]);

  /* ---- build label groups -------------------------------------- */
  const labelGroups = useMemo(() => {
    const groups = new Map();
    items.forEach((wf) => {
      Object.entries(wf.metadata.labels || {}).forEach(([k, v]) => {
        if (shouldSkip(k, v)) return;
        const dk = trimKey(k);
        if (!groups.has(dk)) groups.set(dk, []);
        groups.get(dk).push({ fullKey: k, value: v });
      });
    });
    /* de-dupe values */
    for (const [dk, arr] of groups) {
      const seen = new Set();
      groups.set(
        dk,
        arr.filter(({ fullKey, value }) => {
          const key = `${fullKey}=${value}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      );
    }
    return groups;
  }, [items]);

  /* ---- flatten rows -------------------------------------------- */
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

  /* ---- filter rows (client-side, within the current page) ------- */
  const activePairs      = Object.entries(filters).filter(([, v]) => v).map(([p]) => p);
  const hasActiveFilters = activePairs.length > 0;
  const keyToValues      = useMemo(() => {
    const m = new Map();
    activePairs.forEach((p) => {
      const [k, v] = p.split("=");
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(v);
    });
    return m;
  }, [activePairs]);

  const filteredRows = useMemo(() => {
    if (!hasActiveFilters) return rows;
    return rows.filter(({ wf }) => {
      const lbl = wf.metadata.labels || {};
      for (const [k, vs] of keyToValues)
        if (!vs.has(lbl[k])) return false;
      return true;
    });
  }, [rows, keyToValues, hasActiveFilters]);

  /* ---- sort rows ----------------------------------------------- */
  const comparator = (a, b) => {
    const { column, dir } = sort;
    const mul   = dir === "asc" ? 1 : -1;
    const gKey  = (r) => r.group;
    const sTime = (r) => new Date(r.wf.status.startedAt).getTime();
    const dur   = (r) => durationSeconds(r.wf);

    switch (column) {
      case "name"     : return mul * a.wf.metadata.name.localeCompare(b.wf.metadata.name);
      case "start"    : return mul * (sTime(a) - sTime(b));
      case "duration" : return mul * (dur(a) - dur(b));
      case "status"   : return mul * a.wf.status.phase.localeCompare(b.wf.status.phase);
      default:
        if (gKey(a) !== gKey(b)) return mul * gKey(a).localeCompare(gKey(b));
        return -sTime(a) + sTime(b);
    }
  };
  const sortedRows = useMemo(() => [...filteredRows].sort(comparator), [filteredRows, sort]);

  /* ---- bulk-selection helpers ---------------------------------- */
  const isRunning  = (wf) => wf.status.phase === "Running";
  const nonRunning = sortedRows.map((r) => r.wf).filter((wf) => !isRunning(wf));
  const allSel     = nonRunning.length > 0 && nonRunning.every((wf) => selected[wf.metadata.name]);

  const toggleRow = (wf) => {
    if (isRunning(wf)) return;
    setSelected((s) => ({ ...s, [wf.metadata.name]: !s[wf.metadata.name] }));
  };
  const toggleSelectAll = () => {
    setSelected((s) => {
      const c = { ...s };
      if (allSel) nonRunning.forEach((wf) => delete c[wf.metadata.name]);
      else        nonRunning.forEach((wf) => { c[wf.metadata.name] = true; });
      return c;
    });
  };

  /* ---- delete helpers ------------------------------------------ */
  const handleSingleDelete = async (name) => {
    if (!window.confirm(`Delete workflow “${name}”?`)) return;
    try {
      await deleteWorkflow(name);
      setItems((it) => it.filter((w) => w.metadata.name !== name));
    } catch (e) { onError(`Failed to delete: ${e.message}`); }
  };
  const handleBatchDelete = async () => {
    const names = Object.keys(selected).filter((n) => selected[n]);
    try {
      await deleteWorkflows(names);
      setItems((it) => it.filter((w) => !names.includes(w.metadata.name)));
      setConfirmNames(null);
      setSelected({});
    } catch (e) { onError(`Batch delete failed: ${e.message}`); }
  };

  /* ---- expanded row toggle ------------------------------------- */
  const toggleExpanded = (name, e) => {
    e.stopPropagation();
    setExpanded((ex) => ({ ...ex, [name]: !ex[name] }));
  };

  /* ---- paging actions ------------------------------------------ */
  const goFirst = () => {
    setCursor("");
    setCursorStack([]);
    setPageNum(1);
  };
  const goPrev = () => {
    if (cursorStack.length === 0) return;
    const prev = cursorStack[cursorStack.length - 1];                // token used to fetch current page
    const beforePrev = cursorStack.slice(0, -1);                    // remaining history
    setCursor(prev);
    setCursorStack(beforePrev.slice(0, -1));                        // drop also the token for the page *before* current
    setPageNum((n) => Math.max(1, n - 1));
  };
  const goNext = () => {
    if (!nextCursor) return;
    setCursorStack((st) => [...st, cursor]);                        // remember where we were
    setCursor(nextCursor);
    setPageNum((n) => n + 1);
  };
  const changePageSize = (n) => {
    setPageSize(n);
    // reset to first page on size change
    setCursor("");
    setCursorStack([]);
    setPageNum(1);
  };

  /* ---- render helpers ------------------------------------------ */
  const sortIndicator = (c) => (sort.column === c ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
  const nextDir       = (c) => (sort.column === c ? (sort.dir === "asc" ? "desc" : "asc") : "asc");
  const clearFilters  = () => setFilters({});

  /* ------------------------------------------------------------------ */
  /*  RENDER                                                             */
  /* ------------------------------------------------------------------ */
  const fullColSpan = 6 + listLabelColumns.length; // checkbox + Name + Start + Duration + Status + labels + Actions

  return (
    <div className="wf-container">
      <h3 className="wf-title">List</h3>

      {loading && items.length === 0 && (
        <div style={{ textAlign: "center", padding: "2rem" }}><Spinner /></div>
      )}

      {/* -------- filter panel -------- */}
      <details className="filter-panel">
        <summary className="filter-title">
          Filters{hasActiveFilters ? " ✓" : ""}
        </summary>

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
            const selectedHere = entries.some(
              ({ fullKey, value }) => filters[`${fullKey}=${value}`]
            );
            return (
              <details key={dk}>
                <summary className={selectedHere ? "selected" : ""}>{dk}</summary>
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

      {/* -------- bulk-delete button -------- */}
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

      {/* -------- main table -------- */}
      <table className="wf-table intimate">
        <thead>
          <tr>
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
            {/* Duration column */}
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "duration", dir: nextDir("duration") })}
            >
              {`Duration${sortIndicator("duration")}`}
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "status", dir: nextDir("status") })}
            >
              {`Status${sortIndicator("status")}`}
            </th>

            {/* extra label columns */}
            {listLabelColumns.map((k) => (
              <th key={`hdr-${k}`}>{trimKey(k)}</th>
            ))}

            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {sortedRows.map(({ wf }) => {
            const nm = wf.metadata.name;
            const durSec = durationSeconds(wf);
            const delOk = wf.status.phase !== "Running";
            const labels = wf.metadata.labels || {};
            const failureMsg =
              wf.status?.message ||
              wf.status?.conditions?.find((c) => c.type === "Failed")?.message ||
              "No reason recorded";

            return (
              <React.Fragment key={nm}>
                {/* ---------- main row ---------- */}
                <tr
                  onClick={() => onShowLogs(nm, null)}
                  style={{ cursor: "pointer" }}
                >
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
                  <td>{fmtTime(wf.status.startedAt)}</td>
                  <td>{fmtDuration(durSec)}</td>

                  {/* ---------- status pill ---------- */}
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
                    ) : wf.status.phase === "Running" ? (
                      <span
                        className="status-pill status-running"
                        title="Running"
                      >
                        <Spinner small />
                      </span>
                    ) : (
                      wf.status.phase
                    )}
                  </td>

                  {/* extra label values */}
                  {listLabelColumns.map((k) => (
                    <td key={`${nm}-${k}`}>{labels[k] ?? ""}</td>
                  ))}

                  {/* ---------- action buttons ---------- */}
                  <td>
                    {/* Logs */}
                    <button
                      className="btn"
                      aria-label="Logs"
                      title="Logs"
                      style={{ padding: "0.35rem" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowLogs(nm, null);
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
                      title="Labels"
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
                      title="Delete"
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

                {/* ---------- expanded row (labels + mini-DAG) ---------- */}
                {expanded[nm] && (
                  <tr className="tr-labels">
                    <td colSpan={fullColSpan}>
                      {/* Mini DAG bubbles */}
                      <MiniDag
                        nodes={wf.status.nodes}
                        onTaskClick={(nodeId) => onShowLogs(nm, nodeId)}
                      />
                      <hr
                        style={{
                          border: 0,
                          borderTop: "1px solid var(--border-color)",
                          margin: "0.6rem 0",
                          opacity: 0.4,
                        }}
                      />
                      {/* label list */}
                      <div className="wf-labels-list">
                        {Object.entries(labels).map(([k, v]) => (
                          <code key={k} title={k}>
                            <strong>{trimKey(k)}</strong>=<span>{v}</span>
                          </code>
                        ))}
                        {Object.keys(labels).length === 0 && <em>No labels</em>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* ---- confirm-delete modal ---- */}
      {confirmNames && (
        <DeleteConfirmModal
          names={confirmNames}
          onConfirm={handleBatchDelete}
          onCancel={() => setConfirmNames(null)}
        />
      )}

      {/* ---- failure-reason modal ---- */}
      {reasonModal && (
        <FailureReasonModal
          name={reasonModal.name}
          reason={reasonModal.reason}
          onClose={() => setReasonModal(null)}
        />
      )}

      {/* ---- fixed bottom pager ---- */}
      <div className="pager-bar" role="navigation" aria-label="Pagination">
        <div className="pager">
          <div className="pager-inner">
            <button className="btn-light" onClick={goFirst} disabled={pageNum === 1}>⟲ First</button>
            <button className="btn-light" onClick={goPrev}  disabled={cursorStack.length === 0}>← Prev</button>
            <button className="btn-light" onClick={goNext}  disabled={!nextCursor}>Next →</button>
            <span style={{ opacity: 0.8, marginLeft: "0.25rem" }}>Page {pageNum}</span>
            <span style={{ marginLeft: "1rem" }}>
              Page size:&nbsp;
              <select value={pageSize} onChange={(e) => changePageSize(parseInt(e.target.value, 10))}>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
