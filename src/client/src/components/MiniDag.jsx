/**
 * MiniDag – a very small, read-only DAG preview rendered as coloured
 * bubbles with arrows, inspired by the native Argo Workflows UI.
 *
 * Props:
 *   • nodes (object) – workflow.status.nodes as returned by Argo
 */
import React from "react";

const PHASE_COLOUR = {
  Succeeded: "#18be94",
  Failed   : "#d64543",
  Running  : "#d98c00",
  Pending  : "#999999",
};

export default function MiniDag({ nodes = {} }) {
  /* pick only “Pod” nodes (task steps) and order by start-time */
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
          <span
            className="dag-node"
            style={{ background: PHASE_COLOUR[n.phase] || "#cccccc" }}
            title={`${n.displayName} – ${n.phase}`}
          />
          {i < steps.length - 1 && <span className="dag-arrow">➔</span>}
        </React.Fragment>
      ))}
    </div>
  );
}
