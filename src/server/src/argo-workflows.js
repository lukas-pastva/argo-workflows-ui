import fetch from "node-fetch";
import fs    from "fs";

/* ------------------------------------------------------------------ */
/*  Environment & debug flag                                          */
/* ------------------------------------------------------------------ */
const {
  ARGO_WORKFLOWS_URL        = "http://argo-workflows-server:2746", // list/logs
  ARGO_WORKFLOWS_TOKEN,
  ARGO_WORKFLOWS_NAMESPACE  = process.env.POD_NAMESPACE || "default",
  DEBUG_LOGS                = "false",
  /* List tuning */
  API_LIST_LIMIT            = "200",   // default page size
  API_INCLUDE_NODES         = "true"   // include minimal nodes in list response
} = process.env;

const debug = DEBUG_LOGS === "true";
const DEFAULT_LIMIT = Math.max(1, parseInt(API_LIST_LIMIT, 10) || 200);
const WITH_NODES    = String(API_INCLUDE_NODES).toLowerCase() !== "false";

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
/*  Fetch exactly one upstream page (cursor-based paging)             */
/* ------------------------------------------------------------------ */
async function fetchWorkflowsPage({ limit, cursor }) {
  const params = new URLSearchParams({
    "listOptions.fieldSelector": "",
    "listOptions.limit"        : String(limit)
  });
  if (cursor) params.set("listOptions.continue", cursor);

  const url = `${ARGO_WORKFLOWS_URL}/api/v1/workflows/${ARGO_WORKFLOWS_NAMESPACE}?${params.toString()}`;
  if (debug) console.log(`[DEBUG] Fetching workflows page (limit=${limit}, cursor=${cursor || "-"})`);
  curlHint(url);

  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`Argo ${r.status}`);

  const j = await r.json();
  const items = Array.isArray(j.items) ? j.items : [];

  const slimmed = items.map(slimWorkflow);

  // next cursor varies in field name
  const nextCursor =
    j.metadata?.continue || j.continueToken || j.continue || null;

  // Sort slimmed page for stable UI (template ASC, startedAt DESC)
  slimmed.sort((a, b) => {
    const aKey = a.spec?.workflowTemplateRef?.name || a.metadata.generateName || "";
    const bKey = b.spec?.workflowTemplateRef?.name || b.metadata.generateName || "";
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    return new Date(b.status.startedAt || 0) - new Date(a.status.startedAt || 0);
  });

  if (debug) {
    console.log(`[DEBUG] Page size=${slimmed.length}, nextCursor=${nextCursor ? "(present)" : "null"}`);
  }

  return { items: slimmed, nextCursor };
}

/* ------------------------------------------------------------------ */
/*  Public list API (always returns {items, nextCursor})              */
/* ------------------------------------------------------------------ */
export async function listWorkflows({ limit = DEFAULT_LIMIT, cursor = "" } = {}) {
  return fetchWorkflowsPage({ limit, cursor });
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
  {
    follow = "true",
    container = "main",
    nodeId,
    podName,
    // Optional pass-throughs matching K8s PodLogOptions
    sinceTime,
    sinceSeconds,
    tailLines,
    timestamps,
    previous,
  } = {}
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
    // Map optional filters to upstream param names
    if (sinceTime)     qs.set("logOptions.sinceTime", String(sinceTime));
    if (sinceSeconds)  qs.set("logOptions.sinceSeconds", String(sinceSeconds));
    if (tailLines)     qs.set("logOptions.tailLines", String(tailLines));
    if (timestamps)    qs.set("logOptions.timestamps", String(timestamps));
    if (previous)      qs.set("logOptions.previous", String(previous));

    const url =
      `${ARGO_WORKFLOWS_URL}/api/v1/workflows/` +
      `${ARGO_WORKFLOWS_NAMESPACE}/${name}/log?${qs.toString()}`;

    if (debug) {
      console.log(
        "[DEBUG] Streaming",
        name,
        finalPodName ? `podName=${finalPodName}` : "workflow-level",
        sinceTime ? `(sinceTime=${sinceTime})` : "",
        sinceSeconds ? `(sinceSeconds=${sinceSeconds})` : ""
      );
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
