/**
 * MiniDag – thumbnail DAG preview with full titles
 *            and click-through to task-level logs.
 */
import React from "react";

const PHASE_COLOUR = {
  Succeeded: "#18be94",
  Failed   : "#d64543",
  Running  : "#d98c00",
  Pending  : "#999999",
};

export default function MiniDag({ nodes = {}, onTaskClick = () => {} }) {
  // keep only real task Pods, order by start time
  const steps = Object.values(nodes)
    .filter((n) => n.type === "Pod")
    .sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));

  if (steps.length === 0) return null;

  return (
    <div className="mini-dag">
      {steps.map((n, i) => (
        <React.Fragment key={n.id}>
          <div
            className="dag-node-wrap"
            title={`${n.displayName} – ${n.phase}`}
            onClick={(e) => {
              e.stopPropagation();     // keep parent row collapsed
              onTaskClick(n.id);       // open task-specific logs
            }}
          >
            <span
              className="dag-node"
              style={{ background: PHASE_COLOUR[n.phase] || "#ccc" }}
            />
            <span className="dag-caption">{n.displayName}</span>
          </div>
          {i < steps.length - 1 && <span className="dag-arrow">➔</span>}
        </React.Fragment>
      ))}
    </div>
  );
}
