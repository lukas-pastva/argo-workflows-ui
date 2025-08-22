import fetch from "node-fetch";
import fs    from "fs";

/* ------------------------------------------------------------------ */
/*  Environment & debug flag                                          */
/* ------------------------------------------------------------------ */
const {
  ARGO_WORKFLOWS_URL        = "http://argo-workflows-server:2746", // list/logs
  ARGO_WORKFLOWS_TOKEN,
  ARGO_WORKFLOWS_NAMESPACE  = process.env.POD_NAMESPACE || "default",
  /* 🆕 Argo Events webhook derivation */
  ARGO_EVENTS_SCHEME        = "http",
  ARGO_EVENTS_SVC_SUFFIX    = "-eventsource-svc",
  ARGO_EVENTS_PORT          = "12000",
  ARGO_EVENTS_PATH          = "/",
  DEBUG_LOGS                = "false",
  /* 🆕 list tuning */
  API_LIST_LIMIT            = "200",   // hard cap of returned items
  API_PAGE_LIMIT            = "100",   // page size for server-side pagination
  API_INCLUDE_NODES         = "true"   // include minimal nodes in list response
} = process.env;

const debug = DEBUG_LOGS === "true";
const HARD_LIMIT = Math.max(1, parseInt(API_LIST_LIMIT, 10)  || 200);
const PAGE_LIMIT = Math.max(1, parseInt(API_PAGE_LIMIT, 10)  || 100);
const WITH_NODES = String(API_INCLUDE_NODES).toLowerCase() !== "false";

/* ------------------------------------------------------------------ */
/*  Helper: obtain the Bearer token (for argo-server API only)        */
/* ------------------------------------------------------------------ */
let saToken = ARGO_WORKFLOWS_TOKEN;
if (!saToken) {
  try {
    saToken = fs
      .readFileSync(
        "/var/run/secrets/kubernetes.io/serviceaccount/token",
        "utf8"
      )
      .trim();
    if (debug) console.log("[DEBUG] Loaded SA token from file system");
  } catch (e) {
    if (debug) console.log("[DEBUG] No SA token file found:", e.message);
  }
}

const headers = () => ({
  "Content-Type": "application/json",
  ...(saToken ? { Authorization: `Bearer ${saToken}` } : {})
});

/* ------------------------------------------------------------------ */
/*  Curl hints for quick debugging                                    */
/* ------------------------------------------------------------------ */
function curlHint(url, method = "GET", body = null) {
  if (!debug) return;
  const tokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
  const dataPart  = body ? `--data '${JSON.stringify(body)}' ` : "";
  console.log(
    `[DEBUG] test-curl:\n` +
      `curl -k -H "Authorization: Bearer $(cat ${tokenPath})" ` +
      `-H "Content-Type: application/json" -X ${method} ` +
      `${dataPart}"${url}"`
  );
}

function curlEventHint(url, method = "POST", bodyText = "") {
  if (!debug) return;
  const safe = bodyText.length > 1000 ? bodyText.slice(0, 1000) + "…(truncated)" : bodyText;
  console.log(
    `[DEBUG] event-curl:\n` +
      `curl -s -H "Content-Type: application/json" -X ${method} ` +
      `--data '${safe}' "${url}"`
  );
}

/* ------------------------------------------------------------------ */
/*  Slimming helpers to keep memory usage low                         */
/* ------------------------------------------------------------------ */
function slimNode(n) {
  // keep only what's needed for MiniDag and suggestions
  const out = {
    id         : n.id,
    type       : n.type,
    displayName: n.displayName,
    phase      : n.phase,
    startedAt  : n.startedAt,
  };
  if (n.templateRef?.name) out.templateRef = { name: n.templateRef.name };
  if (n.podName) out.podName = n.podName;
  if (n.outputs?.parameters?.length) {
    out.outputs = {
      parameters: n.outputs.parameters.map((p) => ({ name: p.name, value: p.value }))
    };
  }
  return out;
}

function slimWorkflow(wf) {
  const slim = {
    apiVersion: wf.apiVersion,
    kind      : wf.kind,
    metadata  : {
      name        : wf.metadata?.name,
      generateName: wf.metadata?.generateName,
      labels      : wf.metadata?.labels || {}
    },
    spec: {
      workflowTemplateRef: wf.spec?.workflowTemplateRef
        ? { name: wf.spec.workflowTemplateRef.name }
        : undefined,
      // used by suggestions; keep only parameter name+value
      arguments: wf.spec?.arguments?.parameters
        ? { parameters: wf.spec.arguments.parameters.map((p) => ({ name: p.name, value: p.value })) }
        : undefined
    },
    status: {
      phase     : wf.status?.phase,
      startedAt : wf.status?.startedAt,
      finishedAt: wf.status?.finishedAt,
      message   : wf.status?.message,
      // keep only Failed condition (used by FailureReasonModal)
      conditions: (wf.status?.conditions || []).filter((c) => c.type === "Failed")
    }
  };
  if (WITH_NODES && wf.status?.nodes) {
    slim.status.nodes = Object.fromEntries(
      Object.entries(wf.status.nodes).map(([id, n]) => [id, slimNode(n)])
    );
  }
  return slim;
}

/* ------------------------------------------------------------------ */
/*  List workflows (paged; sorted by template ASC, start-time DESC)   */
/* ------------------------------------------------------------------ */
export async function listWorkflows({ limit = HARD_LIMIT, pageLimit = PAGE_LIMIT } = {}) {
  let cont      = "";
  const out     = [];
  let pageIndex = 0;

  while (out.length < limit) {
    const params = new URLSearchParams({
      "listOptions.fieldSelector": "",
      "listOptions.limit"        : String(pageLimit)
    });
    if (cont) params.set("listOptions.continue", cont);

    const url = `${ARGO_WORKFLOWS_URL}/api/v1/workflows/${ARGO_WORKFLOWS_NAMESPACE}?${params.toString()}`;
    if (debug) console.log(`[DEBUG] Fetching workflows page ${++pageIndex}: ${url}`);
    curlHint(url);

    const r = await fetch(url, { headers: headers() });
    if (!r.ok) throw new Error(`Argo ${r.status}`);

    const j = await r.json();
    const items = Array.isArray(j.items) ? j.items : [];

    // slim as we go to avoid keeping full page in memory
    for (const wf of items) {
      out.push(slimWorkflow(wf));
      if (out.length >= limit) break;
    }

    // find continue token (K8s-style list metadata or Argo variants)
    cont = j.metadata?.continue || j.continueToken || j.continue || "";
    if (!cont || items.length === 0) break;
  }

  // sort by [template name ASC, start-time DESC]
  out.sort((a, b) => {
    const aKey = a.spec?.workflowTemplateRef?.name || a.metadata.generateName || "";
    const bKey = b.spec?.workflowTemplateRef?.name || b.metadata.generateName || "";
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    return new Date(b.status.startedAt || 0) - new Date(a.status.startedAt || 0);
  });

  if (debug) {
    console.log(`[DEBUG] Sorted ${out.length} workflows by template and start time (limit=${limit}, page=${pageLimit})`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  List workflow templates                                           */
/* ------------------------------------------------------------------ */
export async function listTemplates() {
  const url =
    `${ARGO_WORKFLOWS_URL}/api/v1/workflow-templates/` +
    `${ARGO_WORKFLOWS_NAMESPACE}`;

  if (debug) console.log("[DEBUG] Fetching templates from", url);
  curlHint(url);

  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`Argo ${r.status}`);

  const j = await r.json();
  if (debug) console.log(
    `[DEBUG] Retrieved ${j.items?.length || 0} templates`
  );
  return j.items || [];
}

/* ------------------------------------------------------------------ */
/*  🆕 Trigger via Argo Events webhook                                */
/*      - Uses resourceName (or template) to derive the webhook URL    */
/*      - Sends the *contents of parameters["event-data"]* as payload  */
/* ------------------------------------------------------------------ */

/* Compact JSON-looking parameter values (strip whitespace/newlines)  */
function compactValue(val = "") {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (!/^[\[{]/.test(trimmed)) return val;
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return val;
  }
}

/* Helper to build final webhook URL for a given name */
function eventUrl(name) {
  const service = `${name}${ARGO_EVENTS_SVC_SUFFIX}.${ARGO_WORKFLOWS_NAMESPACE}.svc.cluster.local`;
  const path    = ARGO_EVENTS_PATH.startsWith("/") ? ARGO_EVENTS_PATH : `/${ARGO_EVENTS_PATH}`;
  return `${ARGO_EVENTS_SCHEME}://${service}:${ARGO_EVENTS_PORT}${path}`;
}

export async function triggerEvent({ template, resourceName, parameters }) {
  const name = resourceName || template;
  if (!name) throw new Error("Missing resourceName/template to derive event endpoint");

  /* Determine payload:
     1) If "event-data" exists and is valid JSON → send that object.
     2) If "event-data" is a string but not JSON → send as text/plain.
     3) Else → send the remaining scalar params as JSON object.       */
  const params = parameters || {};
  let payloadObj = null;
  let payloadText = null;

  if (Object.prototype.hasOwnProperty.call(params, "event-data")) {
    const raw = params["event-data"];
    if (typeof raw === "string") {
      const compact = compactValue(raw);
      try {
        payloadObj = JSON.parse(compact);
      } catch {
        payloadText = raw; // keep as text
      }
    } else if (raw && typeof raw === "object") {
      payloadObj = raw;
    } else {
      payloadText = String(raw ?? "");
    }
  } else {
    const obj = {};
    for (const [k, v] of Object.entries(params)) {
      obj[k] = typeof v === "string" ? v : (v == null ? "" : String(v));
    }
    payloadObj = obj;
  }

  const url = eventUrl(name);
  const init = payloadObj
    ? {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(payloadObj)
      }
    : {
        method : "POST",
        headers: { "Content-Type": "text/plain" },
        body   : payloadText ?? ""
      };

  if (debug) {
    console.log(`[DEBUG] Posting to Argo Events webhook: ${url} (resourceName=${name})`);
    curlEventHint(url, "POST", payloadObj ? JSON.stringify(payloadObj) : String(payloadText ?? ""));
  }

  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`Event webhook ${r.status}`);

  const text = await r.text().catch(() => "");
  if (debug) console.log("[DEBUG] Webhook response:", text || "(no body)");
  return { accepted: true, status: r.status };
}

/* ------------------------------------------------------------------ */
/*  Delete a workflow                                                 */
/* ------------------------------------------------------------------ */
export async function deleteWorkflow(name) {
  const url =
    `${ARGO_WORKFLOWS_URL}/api/v1/workflows/` +
    `${ARGO_WORKFLOWS_NAMESPACE}/${name}`;

  if (debug) console.log("[DEBUG] Deleting workflow", name);
  curlHint(url, "DELETE");

  const r = await fetch(url, { method: "DELETE", headers: headers() });
  if (!r.ok) throw new Error(`Argo ${r.status}`);
  return { deleted: true };
}

/* ------------------------------------------------------------------ */
/*  Helper: map nodeId → podName                                      */
/* ------------------------------------------------------------------ */
async function nodeIdToPodName(workflowName, nodeId) {
  const url = `${ARGO_WORKFLOWS_URL}/api/v1/workflows/${ARGO_WORKFLOWS_NAMESPACE}/${workflowName}`;
  if (debug) console.log("[DEBUG] Resolving podName for", nodeId);
  curlHint(url);

  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`Argo ${r.status}`);
  const wf = await r.json();
  const nodes = wf.status?.nodes || {};

  if (nodes[nodeId]?.podName) return nodes[nodeId].podName;

  for (const n of Object.values(nodes)) {
    if (n.id === nodeId && n.podName) return n.podName;
  }

  const node = nodes[nodeId];
  if (node && node.templateRef?.name) {
    const suffix = nodeId.substring(nodeId.lastIndexOf("-") + 1);
    const candidate = `${workflowName}-${node.templateRef.name}-${suffix}`;
    if (debug) console.log("[DEBUG] Derived podName candidate", candidate);
    return candidate;
  }

  const numericSuffix = nodeId.substring(nodeId.lastIndexOf("-") + 1);
  for (const n of Object.values(nodes)) {
    if (n.podName && n.podName.endsWith(numericSuffix)) return n.podName;
  }

  if (debug) console.log("[DEBUG] podName not found for", nodeId);
  return null;
}

/* ------------------------------------------------------------------ */
/*  Stream logs (node-level or workflow-level)                        */
/* ------------------------------------------------------------------ */
export async function streamLogs(
  name,
  res,
  { follow = "true", container = "main", nodeId, podName } = {}
) {
  try {
    let finalPodName = podName;
    if (!finalPodName && nodeId) {
      finalPodName = await nodeIdToPodName(name, nodeId);
      if (!finalPodName) {
        res.status(400).json({ error: `Cannot find pod for nodeId ${nodeId}` });
        return;
      }
    }

    const qs = new URLSearchParams({
      "logOptions.follow": String(follow),
      "logOptions.container": container
    });

    if (finalPodName) qs.set("podName", finalPodName);

    const url =
      `${ARGO_WORKFLOWS_URL}/api/v1/workflows/` +
      `${ARGO_WORKFLOWS_NAMESPACE}/${name}/log?${qs.toString()}`;

    if (debug) {
      console.log("[DEBUG] Streaming", name, finalPodName ? `podName=${finalPodName}` : "workflow-level");
    }
    curlHint(url);

    const upstream = await fetch(url, { headers: headers() });
    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    res.setHeader("Content-Type", upstream.headers.get("content-type"));
    upstream.body.pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Stream error" });
  }
}
