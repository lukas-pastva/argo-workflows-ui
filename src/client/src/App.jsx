import React, { useState } from "react";
import ErrorBanner      from "./components/ErrorBanner.jsx";
import WorkflowList     from "./components/WorkflowList.jsx";
import LogViewer        from "./components/LogViewer.jsx";
import WorkflowTrigger  from "./components/WorkflowTrigger.jsx";
import HelpModal        from "./components/HelpModal.jsx";

export default function App() {
  const [error   , setError]    = useState("");
  const [logWf   , setLogWf]    = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  /* ---------- configurable header background --------------------- */
  const headerBg = import.meta.env.VITE_HEADER_BG;
  const headerStyle = headerBg ? { background: headerBg } : {};

  return (
    <>
      <header className="header" style={headerStyle}>
        <h1>Argo Workflows</h1>
        <button className="btn-light" onClick={() => setShowHelp(true)}>
          Help
        </button>
      </header>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <div className="card">
        <WorkflowTrigger onError={setError} />
      </div>

      <div className="card">
        <WorkflowList onShowLogs={setLogWf} onError={setError} />
      </div>

      {logWf && (
        <LogViewer workflowName={logWf} onClose={() => setLogWf(null)} />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}
