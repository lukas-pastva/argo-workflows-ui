/**
 * MiniDag – a thumbnail DAG preview rendered as coloured bubbles,
 * now with captions and click-through to the parent’s log viewer.
 *
 * Props
 *   • nodes        (object) – workflow.status.nodes
 *   • onTaskClick  (func)   – called with (nodeName) when a bubble is clicked
 */
import React from "react";

const PHASE_COLOUR = {
  Succeeded: "#18be94",
  Failed   : "#d64543",
  Running  : "#d98c00",
  Pending  : "#999999",
};

export default function MiniDag({ nodes = {}, onTaskClick = () => {} }) {
  /* keep only real task Pods, order by start-time */
  const steps = Object.values(nodes)
    .filter((n) => n.type === "Pod")
    .sort(
      (a, b) =>
        new Date(a.startedAt || 0).getTime() -
        new Date(b.startedAt || 0).getTime()
    );

  if (steps.length === 0) return null;

  return (
    <div className="mini-dag">
      {steps.map((n, i) => (
        <React.Fragment key={n.id}>
          <div className="dag-node-wrap">
            <span
              className="dag-node"
              style={{ background: PHASE_COLOUR[n.phase] || "#cccccc" }}
              title={`${n.displayName} – ${n.phase}`}
              onClick={(e) => {
                e.stopPropagation();     // keep parent row collapsed
                onTaskClick(n.id);       // bubble-specific click
              }}
            />
            <span className="dag-caption">{n.displayName}</span>
          </div>
          {i < steps.length - 1 && <span className="dag-arrow">➔</span>}
        </React.Fragment>
      ))}
    </div>
  );
}
