import fetch from "node-fetch";

const {
  ARGO_WORKFLOWS_NAMESPACE  = process.env.POD_NAMESPACE || "default",
  ARGO_EVENTS_SCHEME        = "http",
  ARGO_EVENTS_SVC_SUFFIX    = "-eventsource-svc",
  ARGO_EVENTS_PORT          = "12000",
  ARGO_EVENTS_PATH          = "/",
  DEBUG_LOGS                = "false",
} = process.env;

const debug = DEBUG_LOGS === "true";

function compactValue(val = "") {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (!/^[\[{]/.test(trimmed)) return val;
  try { return JSON.stringify(JSON.parse(trimmed)); } catch { return val; }
}

function eventUrl(name) {
  const service = `${name}${ARGO_EVENTS_SVC_SUFFIX}.${ARGO_WORKFLOWS_NAMESPACE}.svc.cluster.local`;
  const path    = ARGO_EVENTS_PATH.startsWith("/") ? ARGO_EVENTS_PATH : `/${ARGO_EVENTS_PATH}`;
  return `${ARGO_EVENTS_SCHEME}://${service}:${ARGO_EVENTS_PORT}${path}`;
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

export async function createViaEvents({ template, resourceName, parameters }) {
  const name = resourceName || template;
  if (!name) throw new Error("Missing resourceName/template to derive event endpoint");

  const params = parameters || {};
  let payloadObj = null;
  let payloadText = null;

  if (Object.prototype.hasOwnProperty.call(params, "event-data")) {
    const raw = params["event-data"];
    if (typeof raw === "string") {
      const compact = compactValue(raw);
      try { payloadObj = JSON.parse(compact); }
      catch { payloadText = raw; }
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
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadObj) }
    : { method: "POST", headers: { "Content-Type": "text/plain" }, body: payloadText ?? "" };

  if (debug) {
    console.log(`[DEBUG] Posting to Argo Events webhook: ${url} (resourceName=${name})`);
    curlEventHint(url, "POST", payloadObj ? JSON.stringify(payloadObj) : String(payloadText ?? ""));
  }

  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`Event webhook ${r.status}`);
  await r.text().catch(() => "");
  return { accepted: true, status: r.status };
}

