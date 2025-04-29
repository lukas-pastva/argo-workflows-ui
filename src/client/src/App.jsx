import React, { useEffect, useState } from "react";
import ErrorBanner      from "./components/ErrorBanner.jsx";
import WorkflowList     from "./components/WorkflowList.jsx";
import LogViewer        from "./components/LogViewer.jsx";
import WorkflowTrigger  from "./components/WorkflowTrigger.jsx";
import HelpModal        from "./components/HelpModal.jsx";

/* ------------------------------------------------------------------ */
/*  Keep the log-viewer state in the address bar so it’s shareable    */
/* ------------------------------------------------------------------ */
function useLogUrlSync(logWf, setLogWf) {
  /* — open viewer automatically when ?logs=<name> is present — */
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const initial = params.get("logs");
    if (initial) setLogWf(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* — mirror viewer state back to the URL — */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (logWf) {
      params.set("logs", logWf);
    } else {
      params.delete("logs");
    }
    const qs     = params.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [logWf]);
}

export default function App() {
  const [error   , setError]    = useState("");
  const [logWf   , setLogWf]    = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  /* expose log viewer state in the URL */
  useLogUrlSync(logWf, setLogWf);

  /* ---------- configurable header background --------------------- */
  const runtime  = window.__ENV__ || {};
  const headerBg = runtime.headerBg || import.meta.env.VITE_HEADER_BG;
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
