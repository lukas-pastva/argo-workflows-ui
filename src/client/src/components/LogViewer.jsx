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

export default function LogViewer({ workflowName, onClose }) {
  const [lines, setLines] = useState(["Loading.."]);
  const box = useRef();

  /* ---------------- disable body scroll while logs are open ---------------- */
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  /* ---------------- stream log lines ---------------- */
  useEffect(() => {
    let cancelled = false;
    setLines(["Loading.."]);

    (async () => {
      try {
        const resp   = await getWorkflowLogs(workflowName, "main");
        const reader = resp.body.getReader();
        const dec    = new TextDecoder();

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
            setLines(prev => {
              // drop "Loading.." placeholder if it is still present
              const base = prev.length === 1 && prev[0] === "Loading.." ? [] : prev;
              return [...base, ...newLines];
            });
          }
        }
      } catch (e) {
        if (!cancelled) {
          setLines(["Failed to load logs."]);
        }
      }
    })();
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
        position: "fixed",
        inset: 0,
        background: "#fff",
        color: "#000",
        padding: "1rem",
        overflow: "auto",
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
        zIndex: 2000
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
