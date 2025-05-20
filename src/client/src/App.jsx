import React, { useEffect, useState } from "react";
import ErrorBanner      from "./components/ErrorBanner.jsx";
import WorkflowList     from "./components/WorkflowList.jsx";
import LogViewer        from "./components/LogViewer.jsx";
import WorkflowTrigger  from "./components/WorkflowTrigger.jsx";
import HelpModal        from "./components/HelpModal.jsx";
import ThemeToggle      from "./components/ThemeToggle.jsx";
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

  useLogUrlSync(logWf, setLogWf);

  return (
    <>
      {/* ---------- HEADER ---------- */}
      <header className="flex items-center justify-between bg-primary px-4 py-3 text-white">
        <h1 className="text-lg font-semibold">Argo Workflows</h1>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <button
            className="rounded border border-white/80 px-3 py-1 text-sm
                       text-white/90 hover:bg-white/15"
            onClick={() => setShowHelp(true)}
          >
            Help
          </button>
        </div>
      </header>

      <ErrorBanner message={error} onClose={() => setError("")} />

      {/* ---------- CARDS ---------- */}
      <section className="mx-auto max-w-5xl p-4">
        <div className="rounded-lg bg-white p-6 shadow
                        dark:bg-zinc-800/80">
          <WorkflowTrigger onError={setError} />
        </div>

        <div className="mt-6 rounded-lg bg-white p-6 shadow
                        dark:bg-zinc-800/80">
          <WorkflowList onShowLogs={setLogWf} onError={setError} />
        </div>
      </section>

      {logWf && (
        <LogViewer workflowName={logWf} onClose={() => setLogWf(null)} />
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}
