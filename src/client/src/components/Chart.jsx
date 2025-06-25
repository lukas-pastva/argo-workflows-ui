import React, {
  useEffect,
  useState,
  useMemo
} from "react";
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

/* ───── runtime env & helpers ──────────────────────────────────── */
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

function secondsBetween(start, end) {
  return Math.max(0, Math.round((end - start) / 1000));
}

/* ================================================================= */
/*  Main component                                                   */
/* ================================================================= */
export default function Chart({ onError = () => {} }) {
  /* ① raw data from server --------------------------------------- */
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

  /* ② label filters (persisted) ---------------------------------- */
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
    } catch {
      /* ignore storage errors */
    }
  }, [filters]);

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

  /* ③ build label groups for filter panel ----------------------- */
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

  /* ④ filter items according to active label pairs -------------- */
  const filteredItems = useMemo(() => {
    if (!items) return null;
    if (!hasActiveFilters) return items;

    return items.filter((wf) => {
      const lbl = wf.metadata.labels || {};
      for (const [k, vs] of keyToValues) if (!vs.has(lbl[k])) return false;
      return true;
    });
  }, [items, keyToValues, hasActiveFilters]);

  /* ⑤ chart-ready dataset --------------------------------------- */
  const chartData = useMemo(() => {
    if (!filteredItems) return null;
    const labels = filteredItems.map((wf) => wf.metadata.name);
    const data   = filteredItems.map((wf) => {
      const start = new Date(wf.status.startedAt).getTime();
      const end   = wf.status.finishedAt
        ? new Date(wf.status.finishedAt).getTime()
        : Date.now();
      return secondsBetween(start, end);
    });

    return {
      labels,
      datasets: [
        {
          label: "Duration (s)",
          data
        }
      ]
    };
  }, [filteredItems]);

  /* ⑥ render helpers -------------------------------------------- */
  const clearFilters = () => setFilters({});

  /* ⑦ UI --------------------------------------------------------- */
  if (!items)
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <Spinner />
      </div>
    );

  return (
    <div className="card">
      {/* ───── filter panel ────────────────────────────────────── */}
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

      {/* ───── bar chart ───────────────────────────────────────── */}
      {chartData ? (
        <Bar
          data={chartData}
          options={{
            responsive: true,
            plugins: {
              legend: { position: "top" },
              title : { display: true, text: "Workflow durations" }
            },
            scales: {
              x: {
                ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 }
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
