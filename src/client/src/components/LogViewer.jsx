import React, { useEffect, useRef, useState } from "react";
import Ansi from "ansi-to-react";
import { getWorkflowLogs } from "../api";
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
  // Optional filters/overrides
  const [podName, setPodName] = useState("");             // applied
  const [sinceLocal, setSinceLocal] = useState("");        // applied (datetime-local string)
  const [podNameInput, setPodNameInput] = useState("");    // editing buffer
  const [sinceLocalInput, setSinceLocalInput] = useState("");
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
  const box = useRef();

  /* ─── Disable body scroll while viewer is open ─────────────────── */
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, []);

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

        // Convert local datetime to ISO if present
        const sinceTime = sinceLocal ? new Date(sinceLocal).toISOString() : undefined;
        const resp   = await getWorkflowLogs(workflowName, { nodeId, podName: podName.trim() || undefined, sinceTime });
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
  }, [workflowName, nodeId, podName, sinceLocal]);

  /* ─── Auto-scroll (toggleable) ─────────────────────────────────── */
  useEffect(() => {
    if (!autoScroll) return;
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines, autoScroll]);

  // When re-enabling autoscroll, jump to bottom immediately
  useEffect(() => {
    if (autoScroll && box.current) {
      box.current.scrollTop = box.current.scrollHeight;
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
        overflow   : "auto",
        fontFamily : "monospace",
        whiteSpace : "pre-wrap",
        zIndex     : 2000,
      }}
      ref={box}
    >
      {/* Sticky toolbar */}
      <div className="log-toolbar">
        <div className="log-toolbar-left">
          <strong>Logs</strong>
          <span className="log-toolbar-meta">
            {workflowName}
            {nodeId && <> → <code>{nodeId}</code></>}
          </span>
          {/* Pod name override */}
          <label style={{ marginLeft: "0.5rem" }}>
            <input
              type="text"
              placeholder="pod name (optional)"
              value={podNameInput}
              onChange={(e) => setPodNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setPodName(podNameInput); setSinceLocal(sinceLocalInput); } }}
              style={{ padding: "0.25rem 0.4rem" }}
            />
          </label>
          {/* Start timestamp (youngest >=) */}
          <label style={{ marginLeft: "0.5rem" }} title="Start at timestamp (>=)">
            <input
              type="datetime-local"
              step="1"
              value={sinceLocalInput}
              onChange={(e) => setSinceLocalInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setPodName(podNameInput); setSinceLocal(sinceLocalInput); } }}
              style={{ padding: "0.25rem 0.4rem" }}
            />
          </label>
          <button
            className="btn-light"
            style={{ marginLeft: "0.25rem" }}
            onClick={() => { setPodName(podNameInput); setSinceLocal(sinceLocalInput); }}
            title="Apply filters"
          >
            Apply
          </button>
          {(sinceLocal || sinceLocalInput) && (
            <button
              className="btn-light"
              style={{ marginLeft: "0.25rem" }}
              onClick={() => { setSinceLocal(""); setSinceLocalInput(""); }}
              title="Clear start timestamp"
            >
              Clear time
            </button>
          )}
        </div>
        <div className="log-toolbar-actions">
          <button
            className="btn-light"
            onClick={zoomIn}
            title="Increase text size"
            aria-label="Increase text size"
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
          >
            <span className="btn-icon" aria-hidden>
              <IconZoomOut />
            </span>
          </button>
          <button
            className="btn-light"
            onClick={handleCopy}
            title="Copy logs to clipboard"
            aria-label="Copy logs to clipboard"
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
          >
            <span className="btn-icon" aria-hidden>
              <IconDownload />
            </span>
            <span className="btn-label">Download</span>
          </button>
          <button
            className="btn-light"
            onClick={onClose}
            title="Close logs"
            aria-label="Close logs"
          >
            <span className="btn-icon" aria-hidden>
              <IconClose />
            </span>
            <span className="btn-label">Close</span>
          </button>
        </div>
      </div>

      {/* Failure / error summary (for failed/error runs) */}
      {failureMessage && (
        <div className="log-failure-banner">
          <strong>{phase || "Failed"}: </strong>
          <span>{failureMessage}</span>
        </div>
      )}

      {/* Log lines */}
      <div
        className="log-lines"
        style={{ fontSize: `${Number.isFinite(fontSize) ? fontSize : 14}px`, lineHeight: 1.4 }}
      >
        {lines.map((l, i) => (
          <div key={i}><Ansi useClasses>{l}</Ansi></div>
        ))}
      </div>
    </div>
  );
}
