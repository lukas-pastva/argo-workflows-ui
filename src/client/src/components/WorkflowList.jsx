import React, { useEffect, useMemo, useState } from "react";
import {
  listWorkflows,
  deleteWorkflow,
  deleteWorkflows,
} from "../api";
import DeleteConfirmModal   from "./DeleteConfirmModal.jsx";
import FailureReasonModal   from "./FailureReasonModal.jsx";
import Spinner              from "./Spinner.jsx";
import MiniDag              from "./MiniDag.jsx";   // ✓ tiny DAG preview with captions

/* ------------------------------------------------------------------ */
/*  Runtime env helpers                                               */
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
  const dk = trimKey(k);
  return rawSkip.some((p) =>
    p.includes("=") ? p === `${k}=${v}` : p === k || p === dk
  );
};
const fmtLocal = (ts) => new Date(ts).toLocaleString();

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export default function WorkflowList({ onShowLogs, onError = () => {} }) {
  /* ------------ state ------------------------------------------ */
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState({});
  const [confirmNames, setConfirmNames] = useState(null);
  const [expanded, setExpanded]         = useState({});
  const [reasonModal, setReasonModal]   = useState(null);
  const [filters, setFilters]           = useState(() => {
    try { return JSON.parse(localStorage.getItem("workflowFilters") || "{}"); }
    catch { return {}; }
  });
  const [sort, setSort]                 = useState({ column: "start", dir: "desc" });

  /* ------------ persist filters -------------------------------- */
  useEffect(() => {
    try { localStorage.setItem("workflowFilters", JSON.stringify(filters)); }
    catch {/* ignore */}
  }, [filters]);

  /* ------------ fetch list (auto-refresh) ---------------------- */
  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true);
        setItems(await listWorkflows());
      } catch (e) {
        onError(e.status === 403 ? "Access denied (HTTP 403)" : e.message);
      } finally { setLoading(false); }
    }
    fetchAll();
    const id = setInterval(fetchAll, 10_000);
    return () => clearInterval(id);
  }, [onError]);

  /* ------------ build label groups ----------------------------- */
  const labelGroups = useMemo(() => {
    const g = new Map();
    items.forEach((wf) =>
      Object.entries(wf.metadata.labels || {}).forEach(([k, v]) => {
        if (shouldSkip(k, v)) return;
        const dk = trimKey(k);
        if (!g.has(dk)) g.set(dk, []);
        g.get(dk).push({ fullKey: k, value: v });
      })
    );
    for (const [dk, arr] of g) {
      const seen = new Set();
      g.set(
        dk,
        arr.filter(({ fullKey, value }) => {
          const key = `${fullKey}=${value}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      );
    }
    return g;
  }, [items]);

  /* ------------ flatten / filter / sort rows ------------------- */
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

  const activePairs = Object.entries(filters).filter(([, v]) => v).map(([p]) => p);
  const keyToValues = useMemo(() => {
    const m = new Map();
    activePairs.forEach((p) => {
      const [k, v] = p.split("=");
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(v);
    });
    return m;
  }, [activePairs]);

  const filteredRows = useMemo(() => {
    if (!activePairs.length) return rows;
    return rows.filter(({ wf }) => {
      const l = wf.metadata.labels || {};
      for (const [k, vs] of keyToValues) if (!vs.has(l[k])) return false;
      return true;
    });
  }, [rows, keyToValues, activePairs]);

  const comparator = (a, b) => {
    const { column, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    const gKey = (r) => r.group;
    const sAt = (r) => new Date(r.wf.status.startedAt).getTime();
    switch (column) {
      case "name":   return mul * a.wf.metadata.name.localeCompare(b.wf.metadata.name);
      case "start":  return mul * (sAt(a) - sAt(b));
      case "status": return mul * a.wf.status.phase.localeCompare(b.wf.status.phase);
      default:
        if (gKey(a) !== gKey(b)) return mul * gKey(a).localeCompare(gKey(b));
        return -sAt(a) + sAt(b);
    }
  };
  const sortedRows = useMemo(
    () => [...filteredRows].sort(comparator),
    [filteredRows, sort]
  );

  /* ------------ selection helpers ------------------------------ */
  const isRunning  = (wf) => wf.status.phase === "Running";
  const nonRunning = sortedRows.map((r) => r.wf).filter((wf) => !isRunning(wf));
  const allSel     = nonRunning.length && nonRunning.every((wf) => selected[wf.metadata.name]);

  /* ------------ event handlers --------------------------------- */
  const toggleRow = (wf) => {
    if (isRunning(wf)) return;
    setSelected((s) => ({ ...s, [wf.metadata.name]: !s[wf.metadata.name] }));
  };
  const toggleSelectAll = () =>
    setSelected((s) => {
      const c = { ...s };
      if (allSel) nonRunning.forEach((wf) => delete c[wf.metadata.name]);
      else nonRunning.forEach((wf) => (c[wf.metadata.name] = true));
      return c;
    });
  const handleSingleDelete = async (name) => {
    if (!window.confirm(`Delete workflow “${name}”?`)) return;
    try {
      await deleteWorkflow(name);
      setItems((it) => it.filter((w) => w.metadata.name !== name));
    } catch (e) { onError(e.message); }
  };
  const handleBatchDelete = async () => {
    const names = Object.keys(selected).filter((n) => selected[n]);
    try {
      await deleteWorkflows(names);
      setItems((it) => it.filter((w) => !names.includes(w.metadata.name)));
      setConfirmNames(null);
      setSelected({});
    } catch (e) { onError(e.message); }
  };
  const toggleExpanded = (name, e) => {
    e.stopPropagation();
    setExpanded((ex) => ({ ...ex, [name]: !ex[name] }));
  };

  /* small helpers for UI */
  const sortIndicator = (c) => (sort.column === c ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
  const nextDir = (c) => (sort.column === c ? (sort.dir === "asc" ? "desc" : "asc") : "asc");

  /* ------------------------------------------------------------------ */
  /*  render                                                            */
  /* ------------------------------------------------------------------ */
  return (
    <div className="wf-container">
      <h3 className="wf-title">List</h3>

      {loading && items.length === 0 && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <Spinner />
        </div>
      )}

      {/* ------------- filter panel (unchanged content) ------------- */}
      <details className="filter-panel">
        <summary className="filter-title">
          Filters{activePairs.length ? " ✓" : ""}
        </summary>

        <button
          className="btn-light"
          disabled={!activePairs.length}
          style={{ margin: "0.5rem 1rem" }}
          onClick={() => setFilters({})}>
          Clear filters
        </button>

        <div className="label-filters">
          {Array.from(labelGroups.entries()).map(([dk, entries]) => {
            const selHere = entries.some(({ fullKey, value }) => filters[`${fullKey}=${value}`]);
            return (
              <details key={dk}>
                <summary className={selHere ? "selected" : ""}>{dk}</summary>
                <div className="label-values">
                  {entries.map(({ fullKey, value }) => {
                    const pair = `${fullKey}=${value}`;
                    return (
                      <span
                        key={pair}
                        className={filters[pair] ? "selected" : ""}
                        onClick={() => setFilters((f) => ({ ...f, [pair]: !f[pair] }))}>
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

      {/* ------------- bulk-delete button ------------- */}
      {Object.values(selected).some(Boolean) && (
        <div style={{ margin: "0.5rem 1rem" }}>
          <button
            className="btn-danger"
            onClick={() => setConfirmNames(Object.keys(selected).filter((n) => selected[n]))}>
            Delete selected
          </button>
        </div>
      )}

      {/* ------------- main table ------------- */}
      <table className="wf-table intimate">
        <thead>
          <tr>
            <th
              style={{ cursor: "pointer" }}
              title="Sort by template name"
              onClick={() => setSort({ column: "template", dir: nextDir("template") })}>
              Template{sortIndicator("template")}
            </th>
            <th style={{ width: "4rem" }}>
              <input type="checkbox" checked={allSel} onChange={toggleSelectAll} />
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "name", dir: nextDir("name") })}>
              Name{sortIndicator("name")}
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "start", dir: nextDir("start") })}>
              Start Time{sortIndicator("start")}
            </th>
            <th
              style={{ cursor: "pointer" }}
              onClick={() => setSort({ column: "status", dir: nextDir("status") })}>
              Status{sortIndicator("status")}
            </th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {sortedRows.map(({ wf, group }) => {
            const nm      = wf.metadata.name;
            const labels  = wf.metadata.labels || {};
            const running = wf.status.phase === "Running";
            const failureMsg =
              wf.status?.message ||
              wf.status?.conditions?.find((c) => c.type === "Failed")?.message ||
              "No reason recorded";

            /* quick helper so MiniDag can open step logs */
            const openStepLogs = (podName, stepDisplayName) =>
              onShowLogs({ wfName: nm, podName, stepDisplayName });

            return (
              <React.Fragment key={nm}>
                {/* ------------ main row ------------ */}
                <tr onClick={() => onShowLogs({ wfName: nm })} style={{ cursor: "pointer" }}>
                  <td
                    className="group-col"
                    style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {group}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!selected[nm]}
                      disabled={running}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!running) toggleRow(wf);
                      }}
                    />
                  </td>
                  <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {nm}
                  </td>
                  <td>{fmtLocal(wf.status.startedAt)}</td>

                  {/* ------------ status pill ------------ */}
                  <td>
                    {wf.status.phase === "Failed" ? (
                      <span
                        className="status-pill status-failed"
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setReasonModal({ name: nm, reason: failureMsg });
                        }}
                        title="Failed – click for reason">
                        ❌
                      </span>
                    ) : wf.status.phase === "Succeeded" ? (
                      <span className="status-pill status-succeeded" title="Succeeded">
                        ✔
                      </span>
                    ) : wf.status.phase === "Running" ? (
                      <span className="status-pill status-running" title="Running">
                        <Spinner small />
                      </span>
                    ) : (
                      wf.status.phase
                    )}
                  </td>

                  {/* ------------ action buttons ------------ */}
                  <td>
                    <button
                      className="btn"
                      aria-label="Logs"
                      title="Logs"
                      style={{ padding: "0.35rem" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowLogs({ wfName: nm });
                      }}>
                      📜
                    </button>
                    <button
                      className="btn-light"
                      aria-label="Labels / DAG"
                      title="Labels & DAG"
                      style={{ padding: "0.35rem" }}
                      onClick={(e) => toggleExpanded(nm, e)}>
                      🏷
                    </button>
                    <button
                      className="btn-danger"
                      aria-label="Delete"
                      title="Delete"
                      style={{ padding: "0.35rem" }}
                      disabled={running}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSingleDelete(nm);
                      }}>
                      🗑
                    </button>
                  </td>
                </tr>

                {/* ------------ expanded details row ------------ */}
                {expanded[nm] && (
                  <tr className="tr-labels">
                    <td colSpan={6}>
                      {/* ---- tiny DAG with captions ---- */}
                      <MiniDag
                        nodes={wf.status.nodes}
                        onSelectStep={openStepLogs}
                      />

                      <hr
                        style={{
                          border: 0,
                          borderTop: "1px solid var(--border-color)",
                          margin: "0.6rem 0",
                          opacity: 0.4,
                        }}
                      />

                      {/* ---- label list ---- */}
                      <div className="wf-labels-list">
                        {Object.entries(labels).map(([k, v]) => (
                          <code key={k} title={k}>
                            <strong>{trimKey(k)}</strong>=<span>{v}</span>
                          </code>
                        ))}
                        {!Object.keys(labels).length && <em>No labels</em>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* ------------ modals ------------ */}
      {confirmNames && (
        <DeleteConfirmModal
          names={confirmNames}
          onConfirm={handleBatchDelete}
          onCancel={() => setConfirmNames(null)}
        />
      )}
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
