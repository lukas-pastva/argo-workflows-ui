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
export async function deleteWorkflow(name, { force = false } = {}) {
  const qs = force ? "?force=true" : "";
  const r = await fetch(`${base}/workflows/${encodeURIComponent(name)}${qs}`, { method: "DELETE" });
  return jsonOrThrow(r);
}
export async function deleteWorkflows(names) { await Promise.all(names.map((n) => deleteWorkflow(n))); }

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
/*  Pod events for a workflow's task pod                               */
/* ------------------------------------------------------------------ */
export async function getPodEvents(name, { nodeId, podName } = {}) {
  const qs = new URLSearchParams();
  if (nodeId)  qs.set("nodeId", nodeId);
  if (podName) qs.set("podName", podName);
  const url = `${base}/workflows/${encodeURIComponent(name)}/events${qs.toString() ? `?${qs}` : ""}`;
  const data = await jsonOrThrow(await fetch(url));
  // Return normalized list and podName for convenience
  return {
    podName: data?.podName || podName || null,
    items  : Array.isArray(data?.items) ? data.items : [],
  };
}

/* ------------------------------------------------------------------ */
/*  Helper: find workflow by parameter value closest at/after timestamp  */
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
  // Choose the run with the smallest startedAt >= ts (ms precision)
  let best = null;
  let bestDelta = Infinity;

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
        if (delta === 0) return it; // exact match is optimal
        if (delta < bestDelta) {
          best = it;
          bestDelta = delta;
        }
      }
    }

    // Heuristic: if no items at/after ts on this page, further pages are older → stop
    if (!anyAfter) break;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return best;
}

/* ------------------------------------------------------------------ */
/*  Helper: find workflow by LABEL key/value closest at/after timestamp  */
/* ------------------------------------------------------------------ */
export async function findWorkflowByLabelAfterTs(
  labelKey,
  labelValue,
  tsRaw,
  { maxPages = 15, pageLimit } = {}
){
  const tsMs = parseTs(tsRaw);
  if (!tsMs) return null;

  // Support matching by exact key or by key after trimming configured prefixes
  const env = (typeof window !== "undefined" && window.__ENV__) || {};
  const trimPrefixes = (
    env.labelPrefixTrim || (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_LABEL_PREFIX_TRIM) || ""
  )
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const trimKey = (k) => {
    for (const pref of trimPrefixes) {
      if (k.startsWith(pref)) return k.slice(pref.length);
    }
    return k;
  };

  let cursor = "";
  // Choose the run with the smallest startedAt >= ts (ms precision)
  let best = null;
  let bestDelta = Infinity;

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

      const lbl = it?.metadata?.labels || {};
      let matches = false;
      if (String(lbl[labelKey]) === String(labelValue)) {
        matches = true;
      } else {
        for (const [k, v] of Object.entries(lbl)) {
          if (trimKey(k) === labelKey && String(v) === String(labelValue)) {
            matches = true;
            break;
          }
        }
      }
      if (!matches) continue;

      if (Number.isFinite(startedMs) && startedMs >= tsMs) {
        const delta = startedMs - tsMs;
        if (delta === 0) return it; // exact match is optimal
        if (delta < bestDelta) {
          best = it;
          bestDelta = delta;
        }
      }
    }

    if (!anyAfter) break;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return best;
}
