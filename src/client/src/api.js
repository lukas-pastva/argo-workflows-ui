// Very thin wrapper around our own backend – now throws on non-2xx status
const base = "/api";

async function jsonOrThrow(resp) {
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

/* ------------------------------------------------------------------ */
/*  Workflows – both paged and convenience flat list                  */
/* ------------------------------------------------------------------ */

// Paged: returns { items, nextCursor }
export async function listWorkflowsPaged({ limit, cursor } = {}) {
  const qs = new URLSearchParams();
  if (limit)  qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", cursor);
  const url = `${base}/workflows${qs.toString() ? `?${qs}` : ""}`;
  return jsonOrThrow(await fetch(url));
}

// Convenience: return just an array of items (used by Chart etc.)
export async function listWorkflows(opts) {
  const data = await listWorkflowsPaged(opts);
  return Array.isArray(data) ? data : (data.items || []);
}

export async function listTemplates() { return jsonOrThrow(await fetch(`${base}/templates`)); }

export async function submitWorkflow(body) {
  const r = await fetch(`${base}/workflows`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
  return jsonOrThrow(r);
}

/* ---------- delete helpers ----------------------------------- */
export async function deleteWorkflow(name) {
  const r = await fetch(`${base}/workflows/${encodeURIComponent(name)}`, { method: "DELETE" });
  return jsonOrThrow(r);
}
export async function deleteWorkflows(names) { await Promise.all(names.map(deleteWorkflow)); }

/* ------------------------------------------------------------------ */
/*  Get logs for a workflow run.                                       */
/*  – nodeId ⇒ task-pod logs                                           */
/*  – (else) container ⇒ workflow-level logs                           */
/* ------------------------------------------------------------------ */
export async function getWorkflowLogs(
  name,
  { container = "main", nodeId } = {}
) {
  const qs = new URLSearchParams({ follow: "true" });
  if (nodeId) qs.set("nodeId", nodeId);
  else        qs.set("container", container);

  const r = await fetch(`${base}/workflows/${name}/logs?${qs.toString()}`);
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r;                         // streaming Response
}
