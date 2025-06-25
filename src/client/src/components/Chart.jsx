import React, { useEffect, useState, useMemo } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";
import { listWorkflows } from "../api";
import Spinner from "./Spinner.jsx";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

/* ───── runtime env & helpers ───────────────────────────────────── */
const env = window.__ENV__ || {};

/* skip/trim rules shared with the list page ---------------------- */
const rawSkip = (env.skipLabels || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const trimPrefixes = (env.labelPrefixTrim || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const listLabelColumns = (env.listLabelColumns || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const useUtcTime =
  String(env.useUtcTime ?? import.meta.env.VITE_USE_UTC_TIME ?? "")
    .toLowerCase()
    .trim() === "true";

const trimKey = (k) => {
  for (const p of trimPrefixes) if (k.startsWith(p)) return k.slice(p.length);
  return k;
};

const shouldSkip = (k, v) => {
  const dk = trimKey(k);
  return rawSkip.some((p) => {
    if (p.includes("=")) return p === `${k}=${v}`;
    return p === k || p === dk;
  });
};

/* colour map for bar/background ---------------------------------- */
const STATUS_COLOUR = {
  Succeeded: "#18be94",
  Failed   : "#d64543",
  Running  : "#d98c00",
  Pending  : "#999999"
};

/* formatting helpers --------------------------------------------- */
function secondsBetween(start, end) {
  return Math.max(0, Math.round((end - start) / 1000));
}

/* sec →  m:ss  or  h:mm:ss  */
function fmtDuration(sec) {
  const s  = Math.max(0, sec);
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function fmtTime(ts) {
  const d = new Date(ts);
  return useUtcTime
    ? d
        .toLocaleString("en-GB", { hour12: false, timeZone: "UTC" })
        .replace(",", "") + " UTC"
    : d.toLocaleString(undefined, { hour12: false });
}

/* ================================================================= */
/*  Main component                                                   */
/* ================================================================= */
export default function Chart({ onError = () => {} }) {
  /* ① raw data --------------------------------------------------- */
  const [items, setItems] = useState(null);

  useEffect(() => {
    async function refresh() {
      try {
        setItems(await listWorkflows());
      } catch (e) {
        onError(`Failed to load workflows: ${e.message}`);
      }
    }
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [onError]);

  /* ② filters (persisted) --------------------------------------- */
  const [filters, setFilters] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("chartFilters") || "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("chartFilters", JSON.stringify(filters));
    } catch {/* ignore */}
  }, [filters]);

  const activePairs      = Object.entries(filters).filter(([, v]) => v).map(([p]) => p);
  const hasActiveFilters = activePairs.length > 0;

  const keyToValues = useMemo(() => {
    const m = new Map();
    activePairs.forEach((p) => {
      const [k, v] = p.split("=");
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(v);
    });
    return m;
  }, [activePairs]);

  /* ③ label groups for UI --------------------------------------- */
  const labelGroups = useMemo(() => {
    if (!items) return new Map();
    const groups = new Map();
    items.forEach((wf) => {
      Object.entries(wf.metadata.labels || {}).forEach(([k, v]) => {
        if (shouldSkip(k, v)) return;
        const dk = trimKey(k);
        if (!groups.has(dk)) groups.set(dk, []);
        groups.get(dk).push({ fullKey: k, value: v });
      });
    });
    /* de-dupe */
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

  /* ④ apply filters --------------------------------------------- */
  const filteredItems = useMemo(() => {
    if (!items) return null;
    if (!hasActiveFilters) return items;

    return items.filter((wf) => {
      const lbl = wf.metadata.labels || {};
      for (const [k, vs] of keyToValues) if (!vs.has(lbl[k])) return false;
      return true;
    });
  }, [items, keyToValues, hasActiveFilters]);

  /* ⑤ order by start-time ASC ----------------------------------- */
  const orderedItems = useMemo(() => {
    if (!filteredItems) return null;
    return [...filteredItems].sort(
      (a, b) =>
        new Date(a.status.startedAt).getTime() -
        new Date(b.status.startedAt).getTime()
    );
  }, [filteredItems]);

  /* ⑥ build chart dataset --------------------------------------- */
  const chartData = useMemo(() => {
    if (!orderedItems) return null;

    const labels   = orderedItems.map((wf) => wf.metadata.name);
    const data     = [];
    const colours  = [];

    orderedItems.forEach((wf) => {
      const start = new Date(wf.status.startedAt).getTime();
      const end   = wf.status.finishedAt
        ? new Date(wf.status.finishedAt).getTime()
        : Date.now();
      data.push(secondsBetween(start, end));
      colours.push(STATUS_COLOUR[wf.status.phase] || "#3c6cd4");
    });

    return {
      labels,
      datasets: [
        {
          label           : "Duration (s)",
          data,
          backgroundColor : colours,
          borderColor     : colours,
          borderWidth     : 1
        }
      ]
    };
  }, [orderedItems]);

  /* ⑦ helpers ---------------------------------------------------- */
  const clearFilters = () => setFilters({});

  /* ⑧ render ----------------------------------------------------- */
  if (!items)
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <Spinner />
      </div>
    );

  /* tooltip callbacks need orderedItems -------------------------- */
  const tooltipCallbacks = {
    afterLabel: (ctx) => {
      const wf  = orderedItems[ctx.dataIndex];
      const lbl = wf.metadata.labels || {};

      const lines = [
        `Status   : ${wf.status.phase}`,
        `Start    : ${fmtTime(wf.status.startedAt)}`,
        `Duration : ${fmtDuration(ctx.raw)}`
      ];

      listLabelColumns.forEach((k) => {
        if (lbl[k]) lines.push(`${trimKey(k)} : ${lbl[k]}`);
      });

      return lines;
    }
  };

  return (
    <div className="card">
      {/* ─── filter panel ──────────────────────────────────────── */}
      <details className="filter-panel" open={hasActiveFilters}>
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
                <summary className={selectedHere ? "selected" : ""}>
                  {dk}
                </summary>
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
            );
          })}
        </div>
      </details>

      {/* ─── bar chart ─────────────────────────────────────────── */}
      {chartData ? (
        <Bar
          data={chartData}
          options={{
            responsive: true,
            plugins: {
              legend: { display: false },
              title : { display: true, text: "Workflow durations" },
              tooltip: { callbacks: tooltipCallbacks }
            },
            scales: {
              x: {
                ticks: {
                  autoSkip   : true,
                  maxRotation: 45,
                  minRotation: 0
                }
              },
              y: {
                beginAtZero: true,
                title: { display: true, text: "Seconds" }
              }
            }
          }}
        />
      ) : (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <em>No data for selected filters.</em>
        </div>
      )}
    </div>
  );
}
