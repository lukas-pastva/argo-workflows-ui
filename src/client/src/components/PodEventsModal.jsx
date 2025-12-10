import React, { useEffect, useState } from "react";
import ModalPortal from "./ModalPortal.jsx";
import { IconClose } from "./icons";
import { getPodEvents } from "../api.js";

const env = (typeof window !== "undefined" && window.__ENV__) || {};
const useUtcTime = String(env.useUtcTime || "").toLowerCase() === "true";

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return useUtcTime
    ? d.toLocaleString("en-GB", { hour12: false, timeZone: "UTC" }).replace(",",
      "") + " UTC"
    : d.toLocaleString(undefined, { hour12: false });
}

export default function PodEventsModal({ workflowName, nodeId, podName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [resolvedPod, setResolvedPod] = useState(podName || "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await getPodEvents(workflowName, { nodeId, podName });
        if (cancelled) return;
        setEvents(res.items || []);
        if (res.podName) setResolvedPod(res.podName);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load events");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workflowName, nodeId, podName]);

  return (
    <ModalPortal>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ width: "min(92vw, 860px)" }}>
          <button className="modal-close" onClick={onClose} aria-label="close">
            <IconClose width={18} height={18} />
          </button>
          <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Pod events</h2>
          <div style={{ opacity: 0.8, marginBottom: "0.75rem" }}>
            Workflow <code>{workflowName}</code>
            {resolvedPod && (
              <>
                {" "}→ Pod <code>{resolvedPod}</code>
              </>
            )}
          </div>

          {loading ? (
            <div style={{ padding: "1rem 0" }}>Loading…</div>
          ) : error ? (
            <div style={{ color: "#d64543", background: "#ffe5e5", border: "1px solid #f5a8a8", padding: "0.6rem", borderRadius: 4 }}>
              {error}
            </div>
          ) : events.length === 0 ? (
            <div>No events found for this pod.</div>
          ) : (
            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
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
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

