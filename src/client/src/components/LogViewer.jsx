import React, { useEffect, useRef, useState } from "react";
import Ansi from "ansi-to-react";
import { getWorkflowLogs, getWorkflow } from "../api";
import MiniDag from "./MiniDag.jsx";
import {
  IconZoomIn,
  IconZoomOut,
  IconCopy,
  IconCheck,
  IconPause,
  IconPlay,
  IconDownload,
  IconClose,
} from "./icons";

/* ------------------------------------------------------------------ */
/*  Helper: strip JSON envelope produced by Argo’s log API            */
/* ------------------------------------------------------------------ */
function extractContent(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;              // skip empty lines

  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj?.result?.content !== undefined) {
        return obj.result.content;
      }
    } catch {
      /* not JSON → fall through and show raw line */
    }
  }
  return trimmed;
}

const MAX_RETRIES    = 10;   // total attempts = 1 + (MAX_RETRIES-1)
const RETRY_DELAY_MS = 3000; // 3 s between attempts

/**
 * Full-screen log stream.
 * – `workflowName`      (required)
 * – `nodeId`            (optional) → pod-level logs; omit for workflow-level
 * – `phase` / `failureMessage` (optional) → show summary above logs
 */
export default function LogViewer({
  workflowName,
  nodeId = null,
  phase,
  failureMessage,
  onClose,
}) {
  const [lines, setLines] = useState(["Loading …"]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);
  const [wf, setWf] = useState(null); // slim workflow (labels, nodes)
  const [activeNodeId, setActiveNodeId] = useState(nodeId);
  const [activeTab, setActiveTab] = useState("logs"); // logs | events | labels | io
  const [fontSize, setFontSize] = useState(() => {
    try {
      const raw = localStorage.getItem("logFontSizePx");
      const num = Number(raw);
      if (Number.isFinite(num)) return Math.max(6, Math.min(24, num));
    } catch {/* ignore */}
    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(max-width: 640px)").matches;
    return isMobile ? 12 : 16; // default smaller on mobile, larger on desktop
  });
  const linesBox = useRef();
  // Pod events panel state
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [events, setEvents] = useState([]);
  const [eventsPod, setEventsPod] = useState("");

  const runtime = (typeof window !== "undefined" && window.__ENV__) || {};
  const useUtcTime = String(runtime.useUtcTime || "").toLowerCase() === "true";
  function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return useUtcTime
      ? d.toLocaleString("en-GB", { hour12: false, timeZone: "UTC" }).replace(",", "") + " UTC"
      : d.toLocaleString(undefined, { hour12: false });
  }

  async function loadEventsIfNeeded() {
    if (!activeNodeId) return;
    try {
      setEventsLoading(true);
      setEventsError("");
      const { getPodEvents } = await import("../api.js");
      const res = await getPodEvents(workflowName, { nodeId: activeNodeId });
      setEvents(Array.isArray(res.items) ? res.items : []);
      setEventsPod(res.podName || "");
    } catch (e) {
      setEventsError(e?.message || "Failed to load events");
      setEvents([]);
      setEventsPod("");
    } finally {
      setEventsLoading(false);
    }
  }

  // Auto-load events when switching to Events tab or when node changes while on Events tab
  useEffect(() => {
    if (activeTab === "events" && activeNodeId) {
      loadEventsIfNeeded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeNodeId]);

  /* ─── Disable body scroll while viewer is open ─────────────────── */
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, []);

  /* ─── Fetch workflow info (labels + nodes) and poll ────────────── */
  useEffect(() => {
    let cancelled = false;
    setWf(null);

    async function fetchOnce() {
      try {
        const data = await getWorkflow(workflowName);
        if (!cancelled) setWf(data);
      } catch (e) {
        if (!cancelled) console.error("Failed to load workflow details", e);
      }
    }

    fetchOnce();
    const id = setInterval(fetchOnce, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [workflowName]);

  // Keep internal node selection in sync with prop on change
  useEffect(() => { setActiveNodeId(nodeId || null); }, [nodeId]);

  /* ─── Stream log lines (with retries) ──────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    async function openStream(attempt = 1) {
      try {
        if (attempt > 1) {
          setLines((prev) => [
            ...prev,
            `⟳ Retry ${attempt}/${MAX_RETRIES} – connecting …`,
          ]);
        } else {
          setLines(["Loading …"]);
        }

        const resp   = await getWorkflowLogs(workflowName, { nodeId: activeNodeId });
        const reader = resp.body.getReader();
        const dec    = new TextDecoder();

        /* clear placeholder if still present */
        setLines((prev) =>
          prev.length === 1 && prev[0].startsWith("Loading") ? [] : prev
        );

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value);

          /* split into physical lines, extract text from JSON envelope */
          const newLines = chunk
            .split("\n")
            .map(extractContent)
            .filter(Boolean);               // remove null / empty
          if (newLines.length) {
            setLines((prev) => [...prev, ...newLines]);
          }
        }
      } catch (e) {
        if (cancelled) return;

        if (attempt < MAX_RETRIES) {
          setLines((prev) => [
            ...prev,
            `⚠️ ${e.message || "Failed to load logs"}. Retrying in ${
              RETRY_DELAY_MS / 1000
            } s …`,
          ]);
          setTimeout(() => openStream(attempt + 1), RETRY_DELAY_MS);
        } else {
          setLines((prev) => [
            ...prev,
            `❌ Failed after ${MAX_RETRIES} attempts: ${
              e.message || "unknown error"
            }`,
          ]);
        }
      }
    }

    openStream();
    return () => { cancelled = true; };
  }, [workflowName, activeNodeId]);

  /* ─── Auto-scroll (toggleable) ─────────────────────────────────── */
  useEffect(() => {
    if (!autoScroll) return;
    if (linesBox.current) linesBox.current.scrollTop = linesBox.current.scrollHeight;
  }, [lines, autoScroll]);

  // When re-enabling autoscroll, jump to bottom immediately
  useEffect(() => {
    if (autoScroll && linesBox.current) {
      linesBox.current.scrollTop = linesBox.current.scrollHeight;
    }
  }, [autoScroll]);

  /* ─── Close on Escape ──────────────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* ─── Download helper ─────────────────────────────────────────── */
  const handleDownload = () => {
    /* Compose a .log blob and trigger a download                     */
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base  = nodeId ? `${workflowName}-${nodeId}` : workflowName;

    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}-${stamp}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /* ─── Copy-to-clipboard helper ───────────────────────────────── */
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        ta.remove();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch (e) {
        console.error("Copy failed", e);
      }
    }
  };

  // Copy helper for individual items inside I/O panel
  const [copiedKey, setCopiedKey] = useState(null);
  const copyItem = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch (e) {
        console.error("Copy failed", e);
        return;
      }
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  /* ─── Persist font size ───────────────────────────────────────── */
  useEffect(() => {
    try {
      if (Number.isFinite(fontSize))
        localStorage.setItem("logFontSizePx", String(fontSize));
    } catch {/* ignore */}
  }, [fontSize]);

  const zoomIn = () =>
    setFontSize((s) => {
      const base = Number.isFinite(s) ? s : 14;
      return Math.min(24, base + 1);
    });
  const zoomOut = () =>
    setFontSize((s) => {
      const base = Number.isFinite(s) ? s : 14;
      return Math.max(6, base - 1);
    });

  /* ─── Render ───────────────────────────────────────────────────── */
  return (
    <div
      className="log-viewer"
      style={{
        position   : "fixed",
        inset      : 0,
        padding    : "0.75rem 0 1rem",
        display    : "flex",
        flexDirection: "column",
        overflow   : "hidden",
        fontFamily : "monospace",
        zIndex     : 2000,
      }}
      
    >
      {/* Sticky container: buttons + labels/pipeline */}
      <div className="log-sticky">
        <div className="log-toolbar">
          <div className="log-toolbar-left">
            <strong>Detail</strong>
            <span className="log-toolbar-meta">
              {workflowName}
              {activeNodeId && <> → <code>{activeNodeId}</code></>}
            </span>
          </div>
          <div className="log-toolbar-actions">
            <button
              className="btn-light"
              onClick={zoomIn}
              title="Increase text size"
              aria-label="Increase text size"
              disabled={activeTab !== "logs"}
            >
              <span className="btn-icon" aria-hidden>
                <IconZoomIn />
              </span>
            </button>
            <button
              className="btn-light"
              onClick={zoomOut}
              title="Decrease text size"
              aria-label="Decrease text size"
              disabled={activeTab !== "logs"}
            >
              <span className="btn-icon" aria-hidden>
                <IconZoomOut />
              </span>
            </button>
            <button
              className="btn-light"
              onClick={() => setWrapLines((v) => !v)}
              title={wrapLines ? "Disable wrapping" : "Enable wrapping"}
              aria-label={wrapLines ? "Disable wrapping" : "Enable wrapping"}
              aria-pressed={wrapLines}
              disabled={activeTab !== "logs"}
            >
              <span className="btn-icon" aria-hidden>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="4" y1="6"  x2="20" y2="6" />
                  <line x1="4" y1="12" x2="14" y2="12" />
                  <polyline points="14 12 14 18 20 18" />
                </svg>
              </span>
              <span className="btn-label">{wrapLines ? "Wrap: On" : "Wrap: Off"}</span>
            </button>
            <button
              className="btn-light"
              onClick={handleCopy}
              title="Copy logs to clipboard"
              aria-label="Copy logs to clipboard"
              disabled={activeTab !== "logs"}
            >
              <span className="btn-icon" aria-hidden>
                {copied ? <IconCheck /> : <IconCopy />}
              </span>
              <span className="btn-label">{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              className="btn-light"
              onClick={() => setAutoScroll((v) => !v)}
              title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
              aria-label={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
              disabled={activeTab !== "logs"}
            >
              <span className="btn-icon" aria-hidden>
                {autoScroll ? <IconPause /> : <IconPlay />}
              </span>
              <span className="btn-label">Auto-scroll</span>
            </button>
            <button
              className="btn-light"
              onClick={handleDownload}
              title="Download logs"
              aria-label="Download logs"
              disabled={activeTab !== "logs"}
            >
              <span className="btn-icon" aria-hidden>
                <IconDownload />
              </span>
              <span className="btn-label">Download</span>
            </button>
            <button
              className="btn-light"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <span className="btn-icon" aria-hidden>
                <IconClose />
              </span>
              <span className="btn-label">Close</span>
            </button>
          </div>
        </div>
        {/* Tabs + meta + mini pipeline under toolbar */}
        {wf && (
          <div className="log-meta">
            {/* Mini pipeline first */}
            <div
              style={{
                marginTop: "0.25rem",
                borderTop: "1px solid var(--border-color)",
                borderBottom: "1px solid var(--border-color)",
                padding: "0.5rem 0",
              }}
            >
              <MiniDag
                nodes={wf.status?.nodes || {}}
                selectedId={activeNodeId}
                showAll={true}
                onTaskClick={(nid) => {
                  setActiveNodeId(nid);
                  // Clear events state on node switch; reload if on Events tab
                  setEvents([]);
                  setEventsPod("");
                  if (activeTab === "events") {
                    setTimeout(() => { loadEventsIfNeeded(); }, 0);
                  }
                  try {
                    const params = new URLSearchParams(window.location.search);
                    const d = params.get("detail");
                    if (d) {
                      const [w] = d.split("/");
                      if (nid) params.set("detail", `${w}/${nid}`);
                      else      params.set("detail", w);
                      window.history.replaceState(
                        null,
                        "",
                        `${window.location.pathname}?${params.toString()}`
                      );
                    }
                  } catch {/* ignore URL errors */}
                }}
              />
            </div>

            {/* Tabs under pipeline */}
            <div className="tabs" role="tablist" aria-label="Detail Views" style={{ marginTop: "0.35rem" }}>
              {[
                ["logs", "Logs"],
                ["events", "Events"],
                ["labels", "Labels"],
                ["io", "I/O"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={activeTab === key}
                  className={`tab ${activeTab === key ? "active" : ""}`}
                  onClick={() => setActiveTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Failure / error summary (for failed/error runs) */}
      {failureMessage && (
        <div className="log-failure-banner">
          <strong>{phase || "Failed"}: </strong>
          <span>{failureMessage}</span>
        </div>
      )}

      {/* Meta moved inside .log-sticky above */}

      {/* Labels tab content */}
      {activeTab === "labels" && wf && (() => {
        const entries = Object.entries(wf.metadata?.labels || {});
        const count = entries.length;
        return (
          <div
            style={{
              padding: "0.5rem 1rem 1rem",
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              overflowX: "auto",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Labels ({count})</div>
            {count === 0 ? (
              <div style={{ opacity: 0.7 }}>No labels</div>
            ) : (
              <div style={{ margin: 0 }}>
                {entries.map(([k, v]) => (
                  <div key={k} style={{ margin: "2px 0" }}>
                    <code title={k}>
                      <strong>{k}</strong>=<span>{v}</span>
                    </code>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* I/O tab content */}
      {activeTab === "io" && wf && (() => {
        const inputs = (wf?.spec?.arguments?.parameters || []).map((p) => ({ name: p.name, value: p.value }));
        const outMap = new Map();
        const nodes = wf?.status?.nodes || {};
        Object.values(nodes).forEach((n) =>
          (n?.outputs?.parameters || []).forEach((pp) => {
            const key = String(pp.name || "").replace(/^var_/, "");
            const val = pp.value == null ? "" : String(pp.value);
            if (!outMap.has(key)) outMap.set(key, new Set());
            if (val !== "") outMap.get(key).add(val);
          })
        );
        const outputs = Array.from(outMap.entries()).map(([name, set]) => ({ name, values: Array.from(set) }));
        const inCount = inputs.length;
        const outCount = outputs.length;
        return (
          <div
            style={{
              padding: "0.5rem 1rem 1rem",
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              overflowX: "auto",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>I/O ({inCount} in, {outCount} out)</div>
            <div style={{
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              padding: "0.75rem",
              marginTop: "0.5rem",
              background: "var(--card-bg)",
              fontFamily: "var(--font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace)",
            }}>
              <div style={{ marginBottom: "0.5rem" }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Inputs</div>
                {inCount === 0 ? (
                  <div style={{ opacity: 0.7 }}>No inputs</div>
                ) : (
                  <ul className="io-list" style={{ margin: 0 }}>
                    {inputs.map(({ name, value }) => {
                      const v = value == null ? "" : String(value);
                      const key = `in:${name}`;
                      const isCopied = copiedKey === key;
                      return (
                        <li key={key} className="io-row">
                          <div className="io-text">
                            <code style={{ fontWeight: 600 }}>{name}</code>
                            <span>: </span>
                            {(() => {
                              if (name === "event-data") {
                                try {
                                  const obj = JSON.parse(v);
                                  return (
                                    <pre style={{
                                      whiteSpace: "pre-wrap",
                                      margin: "0.25rem 0 0 0",
                                      background: "var(--card-bg)",
                                      border: "1px solid var(--border-color)",
                                      borderRadius: 4,
                                      padding: "0.5rem"
                                    }}>{JSON.stringify(obj, null, 2)}</pre>
                                  );
                                } catch {
                                  return <span>{v}</span>;
                                }
                              }
                              return <span>{v}</span>;
                            })()}
                          </div>
                          <div className="io-actions">
                            <button
                              className="btn-light"
                              title="Copy value"
                              aria-label={`Copy ${name}`}
                              onClick={() => copyItem(key, v)}
                            >
                              <span className="btn-icon" aria-hidden>
                                {isCopied ? <IconCheck /> : <IconCopy />}
                              </span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Outputs</div>
                {outCount === 0 ? (
                  <div style={{ opacity: 0.7 }}>No outputs</div>
                ) : (
                  <ul className="io-list" style={{ margin: 0 }}>
                    {outputs.map(({ name, values }) => {
                      const joined = values.join(", ");
                      const key = `out:${name}`;
                      const isCopied = copiedKey === key;
                      return (
                        <li key={key} className="io-row">
                          <div className="io-text">
                            <code style={{ fontWeight: 600 }}>{name}</code>
                            <span>: </span>
                            <span>{joined}</span>
                          </div>
                          <div className="io-actions">
                            <button
                              className="btn-light"
                              title="Copy value"
                              aria-label={`Copy ${name}`}
                              onClick={() => copyItem(key, joined)}
                            >
                              <span className="btn-icon" aria-hidden>
                                {isCopied ? <IconCheck /> : <IconCopy />}
                              </span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Events tab content */}
      {activeTab === "events" && (
        <div
          style={{
            padding: "0.5rem 1rem 1rem",
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            overflowX: "auto",
          }}
        >
          {!activeNodeId ? (
            <div style={{ opacity: 0.8 }}>Select a task node to view pod events.</div>
          ) : (
            <div style={{
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              padding: "0.75rem",
              background: "var(--card-bg)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <div style={{ fontWeight: 600 }}>
                  {eventsPod ? <>Pod <code>{eventsPod}</code></> : "Pod events"}
                </div>
                <div>
                  <button
                    className="btn-light"
                    onClick={loadEventsIfNeeded}
                    disabled={eventsLoading}
                    title="Refresh events"
                  >
                    {eventsLoading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>
              {eventsError && (
                <div style={{ color: "#d64543", background: "#ffe5e5", border: "1px solid #f5a8a8", padding: "0.5rem", borderRadius: 4, marginBottom: "0.5rem" }}>
                  {eventsError}
                </div>
              )}
              {!eventsError && eventsLoading && (
                <div style={{ opacity: 0.8 }}>Loading…</div>
              )}
              {!eventsError && !eventsLoading && (events?.length || 0) === 0 && (
                <div style={{ opacity: 0.8 }}>No events found for this task pod.</div>
              )}
              {!eventsError && !eventsLoading && (events?.length || 0) > 0 && (
                <table className="wf-table intimate" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Reason</th>
                      <th>Message</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e, i) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtTime(e.lastTimestamp || e.firstTimestamp)}</td>
                        <td>{e.type || ""}</td>
                        <td>{e.reason || ""}</td>
                        <td style={{ maxWidth: 520, whiteSpace: "normal", wordBreak: "break-word" }}>{e.message || ""}</td>
                        <td style={{ textAlign: "right" }}>{e.count || 1}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Log lines */}
      {activeTab === "logs" && (
        <div
          className="log-lines"
          ref={linesBox}
          style={{
            fontSize   : `${Number.isFinite(fontSize) ? fontSize : 14}px`,
            lineHeight : 1.4,
            overflowY  : "auto",
            overflowX  : "auto",
            whiteSpace : wrapLines ? "pre-wrap" : "pre",
            flex       : "1 1 auto",
            minHeight  : 0,
          }}
        >
          {lines.map((l, i) => (
            <div key={i}><Ansi useClasses>{l}</Ansi></div>
          ))}
        </div>
      )}

    </div>
  );
}
