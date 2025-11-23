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
  { container = "main", nodeId, podName, sinceTime, sinceSeconds } = {}
) {
  const qs = new URLSearchParams({ follow: "true" });
  if (podName) qs.set("podName", podName);
  if (nodeId)  qs.set("nodeId", nodeId);
  if (!podName && !nodeId) qs.set("container", container);
  if (sinceTime)    qs.set("sinceTime", sinceTime);
  if (sinceSeconds) qs.set("sinceSeconds", String(sinceSeconds));

  const r = await fetch(`${base}/workflows/${name}/logs?${qs.toString()}`);
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r;                         // streaming Response
}

/* Fetch a single (slim) workflow by name */
export async function getWorkflow(name) {
  return jsonOrThrow(await fetch(`${base}/workflows/${encodeURIComponent(name)}`));
}

/* ------------------------------------------------------------------ */
/*  Helper: find workflow by parameter value closest after timestamp  */
/* ------------------------------------------------------------------ */
function parseTs(tsRaw) {
  if (!tsRaw) return null;
  const s = String(tsRaw).trim();
  // numeric seconds/ms
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    // Heuristic: < 1e12 is seconds, otherwise ms
    return n < 1_000_000_000_000 ? n * 1000 : n;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export async function findWorkflowByParameterAfterTs(
  paramName,
  paramValue,
  tsRaw,
  { maxPages = 15, pageLimit } = {}
) {
  const tsMs = parseTs(tsRaw);
  if (!tsMs) return null;

  let cursor = "";
  let best = null; // { item, delta }

  for (let i = 0; i < maxPages; i++) {
    const { items, nextCursor } = await listWorkflowsPaged({
      limit: pageLimit,
      cursor,
    });

    if (!Array.isArray(items) || items.length === 0) break;

    let anyAfter = false;
    for (const it of items) {
      const startedMs = Date.parse(it.status?.startedAt || 0);
      if (Number.isFinite(startedMs) && startedMs >= tsMs) anyAfter = true;

      const params = it?.spec?.arguments?.parameters || [];
      const match = params.some(
        (p) => p && p.name === paramName && String(p.value) === String(paramValue)
      );
      if (!match) continue;

      if (Number.isFinite(startedMs) && startedMs >= tsMs) {
        const delta = startedMs - tsMs;
        if (!best || delta < best.delta) best = { item: it, delta };
      }
    }

    // Heuristic: upstream pages are chronological; if this page had
    // no items after ts, further pages will be older → stop.
    if (!anyAfter) break;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return best?.item || null;
}
