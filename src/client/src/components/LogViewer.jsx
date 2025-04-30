import React, { useEffect, useRef, useState } from "react";
import Ansi from "ansi-to-react";
import { getWorkflowLogs } from "../api";

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

const MAX_RETRIES    = 10;       // total attempts = 1 + (MAX_RETRIES-1)
const RETRY_DELAY_MS = 3000;     // 3 s between attempts

export default function LogViewer({ workflowName, onClose }) {
  const [lines, setLines] = useState(["Loading …"]);
  const box = useRef();

  /* ---------------- disable body scroll while logs are open ---------------- */
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  /* ---------------- stream log lines (with retries) ------------------------ */
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

        const resp   = await getWorkflowLogs(workflowName, "main");
        const reader = resp.body.getReader();
        const dec    = new TextDecoder();

        /* clear placeholder if still present */
        setLines((prev) =>
          prev.length === 1 && prev[0].startsWith("Loading")
            ? []
            : prev
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
            `⚠️ ${e.message || "Failed to load logs"}. Retrying in ${RETRY_DELAY_MS / 1000}s …`,
          ]);
          setTimeout(() => openStream(attempt + 1), RETRY_DELAY_MS);
        } else {
          setLines((prev) => [
            ...prev,
            `❌ Failed after ${MAX_RETRIES} attempts: ${e.message || "unknown error"}`,
          ]);
        }
      }
    }

    openStream();

    return () => { cancelled = true; };
  }, [workflowName]);

  /* ---------------- auto-scroll ---------------- */
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);

  /* ---------------- close on Escape ---------------- */
  useEffect(() => {
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  /* ---------------- render ---------------- */
  return (
    <div
      style={{
        position  : "fixed",
        inset     : 0,
        background: "#fff",
        color     : "#000",
        padding   : "1rem",
        overflow  : "auto",
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
        zIndex    : 2000,
      }}
      ref={box}
    >
      <button
        className="btn-light"
        style={{ float: "right" }}
        onClick={onClose}
      >
        ✕ Close
      </button>

      <h3 style={{ marginTop: 0 }}>Logs – {workflowName}</h3>

      {lines.map((l, i) => (
        <div key={i}>
          <Ansi>{l}</Ansi>
        </div>
      ))}
    </div>
  );
}
