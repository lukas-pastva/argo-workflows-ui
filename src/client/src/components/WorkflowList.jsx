import React, { useEffect, useMemo, useRef, useState } from "react";
import { IconFilterX, IconChevronsLeft, IconChevronLeft, IconChevronRight } from "./icons";
import { listWorkflowsPaged, deleteWorkflow, deleteWorkflows } from "../api";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";
import Spinner            from "./Spinner.jsx";

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

/* extra label columns visible in the list (from env) */
const listLabelColumns = (
  env.listLabelColumns || import.meta.env.VITE_LIST_LABEL_COLUMNS || ""
)
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
  const [selected, setSelected]         = useState(() => new Set()); // names selected on current page
  const [confirmNames, setConfirmNames] = useState(null);            // null | string[]

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

  // Ensure selection tracks only visible items on the current page
  useEffect(() => {
    // Only keep selection for items on this page that are not Running
    const selectableOnPage = new Set(
      items
        .filter((w) => (w?.status?.phase || "") !== "Running")
        .map((w) => w.metadata.name)
    );
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set();
      prev.forEach((n) => { if (selectableOnPage.has(n)) next.add(n); });
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

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

  /* ---- simplified actions: rows open detail; per-row delete only */

  /* ---- delete helpers ------------------------------------------ */
  const handleSingleDelete = async (name, phase) => {
    const baseMsg = `Delete workflow “${name}”?`;
    const msg =
      phase === "Running"
        ? `${baseMsg}\n\nThis workflow is still running and will be terminated.`
        : baseMsg;
    if (!window.confirm(msg)) return;
    try {
      await deleteWorkflow(name);
      setItems((it) => it.filter((w) => w.metadata.name !== name));
    } catch (e) { onError(`Failed to delete: ${e.message}`); }
  };
  // batch delete removed

  const handleBulkDelete = async (names) => {
    if (!Array.isArray(names) || names.length === 0) return;
    try {
      await deleteWorkflows(names);
      setItems((it) => it.filter((w) => !names.includes(w.metadata.name)));
      setSelected(new Set());
    } catch (e) {
      onError(`Failed to delete: ${e.message}`);
    }
  };

  // expanded row removed

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

  // ---- selection helpers -----------------------------------------
  // For "Select all": only include non-running workflows
  const selectableVisibleNames = useMemo(
    () =>
      sortedRows
        .filter(({ wf }) => (wf?.status?.phase || "") !== "Running")
        .map(({ wf }) => wf.metadata.name),
    [sortedRows]
  );
  const selectedCountInSelectable = useMemo(
    () => selectableVisibleNames.filter((n) => selected.has(n)).length,
    [selectableVisibleNames, selected]
  );
  const allSelected         = selectableVisibleNames.length > 0 && selectedCountInSelectable === selectableVisibleNames.length;
  const someNotAll          = selectedCountInSelectable > 0 && !allSelected;
  const anySelectedVisible  = selected.size > 0;
  const selectAllRef        = useRef(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someNotAll;
  }, [someNotAll]);

  /* ------------------------------------------------------------------ */
  /*  RENDER                                                             */
  /* ------------------------------------------------------------------ */
  // columns: Name, Time, Duration, Status, Actions

  return (
    <div className="wf-container">
      

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
          <span className="btn-icon" aria-hidden>
            <IconFilterX />
          </span>
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

      {/* selection toolbar */}
      {anySelectedVisible && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.5rem 0" }}>
          <span>{Array.from(selected).length} selected</span>
          <button
            className="btn-danger"
            onClick={() => setConfirmNames(Array.from(selected))}
          >
            Delete selected
          </button>
        </div>
      )}

      {/* -------- main table -------- */}
      <table className="wf-table intimate">
        <thead>
          <tr>
            <th style={{ width: "1%" }}>
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                disabled={selectableVisibleNames.length === 0}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSelected(() => (checked ? new Set(selectableVisibleNames) : new Set()));
                }}
              />
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "name", dir: nextDir("name") })}
            >
              {`Name${sortIndicator("name")}`}
            </th>
            {/* Dynamically configured label columns */}
            {listLabelColumns.map((k) => (
              <th key={`lbl-col:${k}`}>{trimKey(k)}</th>
            ))}
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "start", dir: nextDir("start") })}
            >
              {`Time${sortIndicator("start")}`}
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

            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {sortedRows.map(({ wf }) => {
            const nm = wf.metadata.name;
            const durSec = durationSeconds(wf);
            const labels = wf.metadata.labels || {};
            const phase = wf.status.phase;
            const isFailureLike = phase === "Failed" || phase === "Error";
            const failureMsg = isFailureLike
              ? wf.status?.message ||
                wf.status?.conditions?.find(
                  (c) => c.type === "Failed" || c.type === "Error"
                )?.message ||
                "No reason recorded"
              : null;

            return (
              <React.Fragment key={nm}>
                {/* ---------- main row ---------- */}
                <tr
                  onClick={() =>
                    onShowLogs(nm, null, { phase, failureMsg })
                  }
                  style={{ cursor: "pointer" }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${nm}`}
                      disabled={phase === "Running"}
                      title={phase === "Running" ? "Cannot select a running workflow" : undefined}
                      checked={selected.has(nm)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(nm); else next.delete(nm);
                          return next;
                        });
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
                  {/* values for configured label columns */}
                  {listLabelColumns.map((k) => (
                    <td key={`lbl-val:${nm}:${k}`}>
                      {(labels && labels[k]) || ""}
                    </td>
                  ))}
                  <td>{fmtTime(wf.status.startedAt)}</td>
                  <td>{fmtDuration(durSec)}</td>

                  {/* ---------- status pill ---------- */}
                  <td>
                    {isFailureLike ? (
                      <span
                        className="status-pill status-failed"
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowLogs(nm, null, { phase, failureMsg });
                        }}
                        title={
                          phase === "Error"
                            ? "Error – click to view details"
                            : "Failed – click to view reason"
                        }
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
                    ) : phase === "Succeeded" ? (
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
                    ) : phase === "Running" ? (
                      <span
                        className="status-pill status-running"
                        title="Running"
                      >
                        <Spinner small />
                      </span>
                    ) : (
                      phase
                    )}
                  </td>

                  {/* ---------- action buttons ---------- */}
                  <td>
                    {/* Delete */}
                    <button
                      className="btn-danger"
                      aria-label="Delete"
                      title="Delete"
                      style={{ padding: "0.35rem" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSingleDelete(nm, phase);
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

                {/* per-row expanded details removed */}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {Array.isArray(confirmNames) && (
        <DeleteConfirmModal
          names={confirmNames}
          onConfirm={() => {
            const names = confirmNames;
            setConfirmNames(null);
            handleBulkDelete(names);
          }}
          onCancel={() => setConfirmNames(null)}
        />
      )}

      {/* ---- fixed bottom pager ---- */}
      <div className="pager-bar" role="navigation" aria-label="Pagination">
        <div className="pager">
          <div className="pager-inner">
            <button className="btn-light" onClick={goFirst} disabled={pageNum === 1} aria-label="First page">
              <span className="btn-icon" aria-hidden><IconChevronsLeft /></span>
              First
            </button>
            <button className="btn-light" onClick={goPrev}  disabled={cursorStack.length === 0} aria-label="Previous page">
              <span className="btn-icon" aria-hidden><IconChevronLeft /></span>
              Prev
            </button>
            <button className="btn-light" onClick={goNext}  disabled={!nextCursor} aria-label="Next page">
              <span className="btn-icon" aria-hidden><IconChevronRight /></span>
              Next
            </button>
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
