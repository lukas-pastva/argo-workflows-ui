import React, { useEffect, useMemo, useState } from "react";
import {
  listWorkflows,
  deleteWorkflow,
  deleteWorkflows,
} from "../api";
import DeleteConfirmModal from "./DeleteConfirmModal.jsx";
import Spinner            from "./Spinner.jsx";

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

  /* ---- load & persist label filters ---------------------------- */
  const [filters, setFilters] = useState(() => {
    try { return JSON.parse(localStorage.getItem("workflowFilters") || "{}"); }
    catch { return {}; }
  });
  useEffect(() => {
    localStorage.setItem("workflowFilters", JSON.stringify(filters));
  }, [filters]);

  /* --- DEFAULT SORT: by start-time (most-recent first) ----------- */
  const [sort, setSort] = useState({ column: "start", dir: "desc" });

  /* ---------------- fetch list (auto-refresh) ------------------- */
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

  /* ---------------- build label filter groups ------------------- */
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

  /* ---------------- flatten rows -------------------------------- */
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

  /* ---------------- sorting ------------------------------------- */
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

  /* ---------------- bulk-selection helpers ---------------------- */
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

  /* ---------------- delete helpers ------------------------------ */
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

  /* ---------------- expanded-row helpers ------------------------ */
  const toggleExpanded = (name, e) => {
    e.stopPropagation(); /* keep row click (logs) untouched */
    setExpanded((ex) => ({ ...ex, [name]: !ex[name] }));
  };

  /* ---------------- sort-indicator helper ----------------------- */
  const sortIndicator = (col) =>
    sort.column === col ? (sort.dir === "asc" ? " ▲" : " ▼") : "";

  /* ---------------- render -------------------------------------- */
  const clearFilters = () => setFilters({});
  const nextDir = (col) =>
    sort.column === col ? (sort.dir === "asc" ? "desc" : "asc") : "asc";

  return (
    <div className="w-full">
      <h3 className="mb-4 text-lg font-semibold">List</h3>

      {/* global spinner while fetching first list */}
      {loading && items.length === 0 && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {/* filter panel */}
      <details className="mb-4 rounded border border-gray-300 bg-white shadow-sm
                          dark:border-zinc-600 dark:bg-zinc-800/80">
        <summary className="cursor-pointer px-4 py-3 font-semibold">
          Filters{hasActiveFilters ? " ✓" : ""}
        </summary>

        <div className="px-4 py-3">
          <button
            className="mb-3 rounded border border-gray-400 px-3 py-1 text-sm
                       text-gray-700 hover:bg-gray-100
                       disabled:opacity-50
                       dark:border-gray-500 dark:text-gray-200
                       dark:hover:bg-zinc-700/40"
            disabled={!hasActiveFilters}
            onClick={clearFilters}
          >
            Clear filters
          </button>

          <div className="space-y-2">
            {Array.from(labelGroups.entries()).map(([dk, entries]) => {
              const hasSel = entries.some(
                ({ fullKey, value }) => filters[`${fullKey}=${value}`]
              );
              return (
                <details key={dk} className="rounded border">
                  <summary
                    className={`cursor-pointer px-3 py-1.5 font-medium
                                ${hasSel ? "text-primary-dark" : ""}`}
                  >
                    {dk}{hasSel && " ✓"}
                  </summary>

                  <div className="flex flex-wrap gap-2 p-2">
                    {entries.map(({ fullKey, value }) => {
                      const pair = `${fullKey}=${value}`;
                      const active = !!filters[pair];
                      return (
                        <span
                          key={pair}
                          onClick={() =>
                            setFilters((f) => ({ ...f, [pair]: !f[pair] }))
                          }
                          className={`cursor-pointer rounded
                                      px-2 py-1 text-xs
                                      ${active
                                        ? "bg-primary-dark text-white"
                                        : "bg-gray-200 dark:bg-zinc-700/40"}`}
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
        </div>
      </details>

      {/* bulk delete */}
      {Object.values(selected).some(Boolean) && (
        <button
          className="mb-2 rounded bg-red-500 px-4 py-1.5 text-sm font-medium
                     text-white hover:bg-red-600"
          onClick={() =>
            setConfirmNames(Object.keys(selected).filter((n) => selected[n]))
          }
        >
          Delete selected
        </button>
      )}

      {/* main table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-300 dark:border-slate-600">
              <th
                className="cursor-pointer px-3 py-2"
                title="Sort by template name"
                onClick={() =>
                  setSort({ column: "template", dir: nextDir("template") })
                }
              >
                Template{sortIndicator("template")}
              </th>
              <th className="w-14 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSel}
                  onChange={toggleSelectAll}
                />
              </th>
              <th
                className="cursor-pointer px-3 py-2"
                onClick={() => setSort({ column: "name", dir: nextDir("name") })}
              >
                Name{sortIndicator("name")}
              </th>
              <th
                className="cursor-pointer px-3 py-2"
                onClick={() => setSort({ column: "start", dir: nextDir("start") })}
              >
                Start Time{sortIndicator("start")}
              </th>
              <th
                className="cursor-pointer px-3 py-2"
                onClick={() =>
                  setSort({ column: "status", dir: nextDir("status") })
                }
              >
                Status{sortIndicator("status")}
              </th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>

          <tbody>
            {sortedRows.map(({ wf, group }) => {
              const nm     = wf.metadata.name;
              const delOk  = !isRunning(wf);
              const labels = wf.metadata.labels || {};
              return (
                <React.Fragment key={nm}>
                  <tr
                    onClick={() => onShowLogs(nm)}
                    className="cursor-pointer transition
                               even:bg-slate-50 odd:bg-white
                               hover:bg-slate-100
                               dark:even:bg-zinc-800/40 dark:odd:bg-zinc-800/20
                               dark:hover:bg-zinc-700/60"
                  >
                    <td className="max-w-[200px] truncate px-3 py-2">{group}</td>
                    <td className="px-3 py-2">
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
                    <td className="max-w-[250px] truncate px-3 py-2">{nm}</td>
                    <td className="px-3 py-2">{fmtLocal(wf.status.startedAt)}</td>
                    <td className="px-3 py-2">
                      {wf.status.phase === "Failed"
                        ? <span className="rounded bg-red-50 px-2 py-0.5 text-red-600
                                           dark:bg-red-700/40 dark:text-red-300">
                            {wf.status.phase}
                          </span>
                        : wf.status.phase}
                    </td>
                    <td className="space-x-2 px-3 py-2">
                      <button
                        className="rounded bg-primary px-3 py-0.5 text-xs text-white
                                   hover:bg-primary/90"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowLogs(nm);
                        }}
                      >
                        Logs
                      </button>
                      <button
                        className="rounded border border-primary px-3 py-0.5
                                   text-xs text-primary hover:bg-primary/10"
                        onClick={(e) => toggleExpanded(nm, e)}
                      >
                        Labels
                      </button>
                      <button
                        className="rounded bg-red-500 px-3 py-0.5 text-xs text-white
                                   hover:bg-red-600 disabled:opacity-60"
                        disabled={!delOk}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSingleDelete(nm);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>

                  {/* expanded label row */}
                  {expanded[nm] && (
                    <tr className="bg-slate-50 dark:bg-zinc-800/40">
                      <td colSpan={6} className="px-6 py-3">
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                          {Object.entries(labels).length === 0 && (
                            <em className="text-gray-500">No labels</em>
                          )}
                          {Object.entries(labels).map(([k, v]) => (
                            <code
                              key={k}
                              className="rounded bg-gray-200 px-2 py-0.5 font-mono
                                         dark:bg-zinc-700/50"
                            >
                              <strong>{trimKey(k)}</strong>=<span>{v}</span>
                            </code>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

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
