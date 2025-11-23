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

export default function MiniDag({
  nodes = {},
  onTaskClick = () => {},
  selectedId = null,
  showAll = false,
}) {
  // keep only real task Pods, order by start time
  const steps = Object.values(nodes)
    .filter((n) => n.type === "Pod")
    .sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));

  // Build sequence, optionally prepending an "All steps" pseudo-node
  const sequence = showAll
    ? [{ id: null, displayName: "All steps", phase: "Pending", isAll: true }, ...steps]
    : steps;

  if (sequence.length === 0) return null;

  return (
    <div className="mini-dag">
      {sequence.map((n, i) => (
        <React.Fragment key={n.id ?? "__all__"}>
          <div
            className={`dag-node-wrap${(selectedId ?? null) === (n.id ?? null) ? " selected" : ""}`}
            title={n.isAll ? "All steps" : `${n.displayName} – ${n.phase}`}
            onClick={(e) => {
              e.stopPropagation();
              onTaskClick(n.id ?? null);
            }}
          >
            <span
              className="dag-node"
              style={{ background: n.isAll ? "#999999" : (PHASE_COLOUR[n.phase] || "#ccc") }}
            />
            <span className="dag-caption">{n.isAll ? "All" : n.displayName}</span>
          </div>
          {i < sequence.length - 1 && <span className="dag-arrow">➔</span>}
        </React.Fragment>
      ))}
    </div>
  );
}
