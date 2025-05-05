import fetch from "node-fetch";
import fs    from "fs";

/* ------------------------------------------------------------------ */
/*  Environment & debug flag                                          */
/* ------------------------------------------------------------------ */
const {
  ARGO_WORKFLOWS_URL        = "http://argo-workflows-server:2746",
  ARGO_WORKFLOWS_TOKEN,
  ARGO_WORKFLOWS_NAMESPACE  = process.env.POD_NAMESPACE || "default",
  DEBUG_LOGS                = "false"
} = process.env;

const debug = DEBUG_LOGS === "true";

/* ------------------------------------------------------------------ */
/*  Helper: obtain the Bearer token                                   */
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
/*  Helper: print a ready-to-copy curl                                */
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
/*  List workflows                                                    */
/*  (sorted by template ASC, then start‑time DESC)                     */
/* ------------------------------------------------------------------ */
export async function listWorkflows() {
  const url =
    `${ARGO_WORKFLOWS_URL}/api/v1/workflows/` +
    `${ARGO_WORKFLOWS_NAMESPACE}?listOptions.fieldSelector=`;

  if (debug) console.log("[DEBUG] Fetching workflows from", url);
  curlHint(url);

  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`Argo ${r.status}`);

  const j = await r.json();
  const items = j.items || [];

  // sort by [template name ASC, start‑time DESC]
  items.sort((a, b) => {
    const aKey = a.spec?.workflowTemplateRef?.name || a.metadata.generateName || "";
    const bKey = b.spec?.workflowTemplateRef?.name || b.metadata.generateName || "";
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    return new Date(b.status.startedAt) - new Date(a.status.startedAt);
  });

  if (debug) console.log(
    `[DEBUG] Sorted ${items.length} workflows by template and start time`
  );
  return items;
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
/*  Submit workflow from a template                                   */
/* ------------------------------------------------------------------ */

/* --- NEW: compact JSON parameters (strips all whitespace/newlines) -- */
function compactValue(val = "") {
  if (typeof val !== "string") return val;

  const trimmed = val.trim();
  if (!/^[\[{]/.test(trimmed)) return val;      // fast‑exit for non‑JSON

  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return val;                                // keep original if not valid JSON
  }
}

export async function submitWorkflow({ template, parameters }) {
  // Turn { key: value } pairs into ["key=value", ...],
  // while compacting any JSON‑looking values so Argo sees them without “\n”.
  const paramStrings = Object
    .entries(parameters || {})
    .map(([n, v]) => `${n}=${compactValue(v)}`);

  const body = {
    resourceKind : "WorkflowTemplate",
    resourceName : template,
    submitOptions: {
      generateName: `${template}-`,
      ...(paramStrings.length ? { parameters: paramStrings } : {})
    }
  };

  const url =
    `${ARGO_WORKFLOWS_URL}/api/v1/workflows/` +
    `${ARGO_WORKFLOWS_NAMESPACE}/submit`;

  if (debug) {
    console.log(
      `[DEBUG] Submitting workflowTemplate ${template}` +
      (paramStrings.length
        ? ` with ${paramStrings.length} parameters`
        : " (no parameters)")
    );
  }
  curlHint(url, "POST", body);

  const r = await fetch(url, {
    method : "POST",
    headers: headers(),
    body   : JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Argo ${r.status}`);

  const result = await r.json();
  if (debug) console.log("[DEBUG] Workflow‑submit response:", result);
  return result;
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
/*  Stream logs                                                       */
/* ------------------------------------------------------------------ */
export async function streamLogs(
  name,
  res,
  { follow = true, container = "main" } = {}
) {
  const qs = new URLSearchParams({
    "logOptions.container": container,
    "logOptions.follow"   : String(follow)
  });
  const url =
    `${ARGO_WORKFLOWS_URL}/api/v1/workflows/` +
    `${ARGO_WORKFLOWS_NAMESPACE}/${name}/log?${qs.toString()}`;

  if (debug)
    console.log("[DEBUG] Streaming logs for", name, "from", url);
  curlHint(url);

  const upstream = await fetch(url, { headers: headers() });
  if (!upstream.ok) {
    res.status(upstream.status).end();
    return;
  }
  res.setHeader("Content-Type", upstream.headers.get("content-type"));
  upstream.body.pipe(res);
}
