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
        <h1>Argo Workflows</h1>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            className="btn-light"
            disabled={page === "list"}
            onClick={() => setPage("list")}
          >
            List
          </button>
          <button
            className="btn-light"
            disabled={page === "chart"}
            onClick={() => setPage("chart")}
          >
            Chart
          </button>

          <ThemeToggle />
          <button className="btn-light" onClick={() => setShowHelp(true)}>
            Help
          </button>
        </div>
      </header>

      <ErrorBanner message={error} onClose={() => setError("")} />

      {page === "list" ? (
        <>
          <div className="card">
            <WorkflowTrigger onError={setError} />
          </div>

          <div className="card">
            <WorkflowList
              onShowLogs={(wf, nodeId = null) =>
                setLogTarget({ name: wf, nodeId })
              }
              onError={setError}
            />
          </div>

          {logTarget && (
            <LogViewer
              workflowName={logTarget.name}
              nodeId={logTarget.nodeId}
              onClose={() => setLogTarget(null)}
            />
          )}
        </>
      ) : (
        /* page === "chart" */
        <Chart onError={setError} />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}
