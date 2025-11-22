import React, { useEffect, useState } from "react";
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
    const p = new URLSearchParams(window.location.search).get("logs");
    if (p) {
      const [w, n] = p.split("/");
      setTarget({ name: w, nodeId: n || null });
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (target)
      params.set(
        "logs",
        target.nodeId ? `${target.name}/${target.nodeId}` : target.name
      );
    else params.delete("logs");

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
  const [page,      setPage]      = useState("list");   // "list" | "chart"

  useLogUrlSync(logTarget, setLogTarget);

  const runtime  = window.__ENV__ || {};
  const headerBg = runtime.headerBg || import.meta.env.VITE_HEADER_BG;

  return (
    <>
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

      <ErrorBanner message={error} onClose={() => setError("")} />

      {/* Tab panels */}
      <div
        id="panel-list"
        role="tabpanel"
        aria-labelledby="tab-list"
        hidden={page !== "list"}
      >
        <div className="card">
          <WorkflowTrigger onError={setError} />
        </div>

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

        {logTarget && (
          <LogViewer
            workflowName={logTarget.name}
            nodeId={logTarget.nodeId}
            phase={logTarget.phase}
            failureMessage={logTarget.failureMessage}
            onClose={() => setLogTarget(null)}
          />
        )}
      </div>

      <div
        id="panel-chart"
        role="tabpanel"
        aria-labelledby="tab-chart"
        hidden={page !== "chart"}
      >
        <Chart onError={setError} />
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}
