import React, { useEffect, useState } from "react";
import { findWorkflowByLabelAfterTs } from "./api.js";
import ErrorBanner     from "./components/ErrorBanner.jsx";
import WorkflowList    from "./components/WorkflowList.jsx";
import LogViewer       from "./components/LogViewer.jsx";
import WorkflowTrigger from "./components/WorkflowTrigger.jsx";
import HelpModal       from "./components/HelpModal.jsx";
import ThemeToggle     from "./components/ThemeToggle.jsx";
import Chart           from "./components/Chart.jsx";

/* ─── keep log-viewer state in URL so it’s shareable ─────────────── */
function useLogUrlSync(target, setTarget) {
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get("detail");
    if (p) {
      const [w, n] = p.split("/");
      setTarget({ name: w, nodeId: n || null });
    }
    // If no explicit ?detail= but we have a deep-link search, resolve it
    // client-side and open the matching workflow logs.
    if (!p) {
      const params = new URLSearchParams(window.location.search);
      const ts = params.get("ts") || params.get("timestamp");
      if (ts) {
        (async () => {
          try {
            // Recognize only configured extra list columns as keys.
            const env = window.__ENV__ || {};
            const listCols = (env.listLabelColumns || import.meta.env.VITE_LIST_LABEL_COLUMNS || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            // Prepare trimmed aliases so ?application= works even if real key is prefixed
            const trimPrefixes = (env.labelPrefixTrim || import.meta.env.VITE_LABEL_PREFIX_TRIM || "")
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
            const trimKey = (k) => {
              for (const pref of trimPrefixes) if (k.startsWith(pref)) return k.slice(pref.length);
              return k;
            };
            const keysToCheck = Array.from(new Set([
              ...listCols,
              ...listCols.map(trimKey),
            ]));

            for (const key of keysToCheck) {
              const value = params.get(key);
              if (!value) continue;
              const wf = await findWorkflowByLabelAfterTs(key, value, ts, {});
              if (wf?.metadata?.name) {
                setTarget({ name: wf.metadata.name, nodeId: null });
                break;
              }
            }
          } catch (e) {
            console.error("Deep-link search failed", e);
          }
        })();
      }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (target) {
      params.set(
        "detail",
        target.nodeId ? `${target.name}/${target.nodeId}` : target.name
      );
    } else {
      params.delete("detail");
    }

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${params.toString() ? "?" + params : ""}`
    );
  }, [target]);
}

export default function App() {
  const [error,     setError]     = useState("");
  const [logTarget, setLogTarget] = useState(null);
  const [showHelp,  setShowHelp]  = useState(false);
  const [page,      setPage]      = useState("list");   // "list" | "chart" | "logs"

  useLogUrlSync(logTarget, setLogTarget);

  // When logTarget is set, switch to logs page; when cleared, go back to list
  useEffect(() => {
    if (logTarget) {
      setPage("logs");
    }
  }, [logTarget]);

  const runtime  = window.__ENV__ || {};
  const headerBg = runtime.headerBg || import.meta.env.VITE_HEADER_BG;
  const canSubmit = String(runtime.canSubmit ?? "true").toLowerCase() === "true";

  return (
    <>
      {/* Hide header when viewing logs page */}
      {page !== "logs" && (
        <header
          className="header"
          style={headerBg ? { background: headerBg } : {}}
        >
          <h1>Workflows</h1>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <div className="tabs" role="tablist" aria-label="Views">
              <button
                id="tab-list"
                role="tab"
                aria-selected={page === "list"}
                aria-controls="panel-list"
                className={`tab ${page === "list" ? "active" : ""}`}
                onClick={() => setPage("list")}
              >
                List
              </button>
              <button
                id="tab-chart"
                role="tab"
                aria-selected={page === "chart"}
                aria-controls="panel-chart"
                className={`tab ${page === "chart" ? "active" : ""}`}
                onClick={() => setPage("chart")}
              >
                Chart
              </button>
            </div>

            <ThemeToggle />
            <button className="btn-light" onClick={() => setShowHelp(true)}>
              Help
            </button>
          </div>
        </header>
      )}

      <ErrorBanner message={error} onClose={() => setError("")} />

      {/* Tab panels */}
      <div
        id="panel-list"
        role="tabpanel"
        aria-labelledby="tab-list"
        hidden={page !== "list"}
      >
        {canSubmit && (
          <div className="card">
            <WorkflowTrigger onError={setError} />
          </div>
        )}

        <div className="card">
          <WorkflowList
            onShowLogs={(wf, nodeId = null, meta = {}) =>
              setLogTarget({
                name           : wf,
                nodeId,
                phase          : meta.phase,
                failureMessage : meta.failureMsg,
              })
            }
            onError={setError}
          />
        </div>
      </div>

      <div
        id="panel-chart"
        role="tabpanel"
        aria-labelledby="tab-chart"
        hidden={page !== "chart"}
      >
        <Chart onError={setError} />
      </div>

      {/* Logs page - separate full page instead of overlay */}
      {page === "logs" && logTarget && (
        <LogViewer
          workflowName={logTarget.name}
          nodeId={logTarget.nodeId}
          phase={logTarget.phase}
          failureMessage={logTarget.failureMessage}
          onClose={() => {
            setLogTarget(null);
            setPage("list");
          }}
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}
