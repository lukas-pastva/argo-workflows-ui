import fetch from "node-fetch";
import fs from "fs";
import https from "https";

const {
  ARGO_WORKFLOWS_NAMESPACE = process.env.POD_NAMESPACE || "default",
  ARGO_WORKFLOWS_TOKEN,
  K8S_API_URL = "https://kubernetes.default.svc",
  K8S_CA_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt",
  K8S_INSECURE_SKIP_TLS_VERIFY = "false",
  DEBUG_LOGS = "false",
} = process.env;

const debug = DEBUG_LOGS === "true";

function readToken() {
  if (ARGO_WORKFLOWS_TOKEN) return ARGO_WORKFLOWS_TOKEN;
  try {
    const t = fs.readFileSync(
      "/var/run/secrets/kubernetes.io/serviceaccount/token",
      "utf8"
    ).trim();
    if (debug) console.log("[DEBUG] K8s: Loaded SA token from file system");
    return t;
  } catch (e) {
    if (debug) console.log("[DEBUG] K8s: SA token file missing:", e.message);
    return "";
  }
}

function buildAgent() {
  try {
    if (fs.existsSync(K8S_CA_PATH)) {
      const ca = fs.readFileSync(K8S_CA_PATH, "utf8");
      if (debug) console.log("[DEBUG] K8s: Using cluster CA at", K8S_CA_PATH);
      return new https.Agent({ ca });
    }
  } catch {}
  if (String(K8S_INSECURE_SKIP_TLS_VERIFY).toLowerCase() === "true") {
    if (debug) console.log("[DEBUG] K8s: INSECURE skip TLS verify");
    return new https.Agent({ rejectUnauthorized: false });
  }
  return undefined; // default agent
}

function headers(token) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toArgsParameters(parameters = {}) {
  return Object.entries(parameters).map(([name, value]) => ({
    name,
    value: typeof value === "string" ? value : (value == null ? "" : JSON.stringify(value)),
  }));
}

function curlHint(url, body) {
  if (!debug) return;
  const tokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
  const safe = body.length > 1000 ? body.slice(0, 1000) + "…(truncated)" : body;
  console.log(
    `[DEBUG] k8s-curl:\n` +
      `curl -k -H "Authorization: Bearer $(cat ${tokenPath})" ` +
      `-H "Content-Type: application/json" -X POST --data '${safe}' "${url}"`
  );
}

export async function createViaK8s({ template, resourceName, parameters }) {
  const name = resourceName || template;
  if (!name) throw new Error("Missing resourceName/template");

  const body = {
    apiVersion: "argoproj.io/v1alpha1",
    kind: "Workflow",
    metadata: { generateName: `${name}-` },
    spec: {
      workflowTemplateRef: { name },
      arguments: { parameters: toArgsParameters(parameters || {}) },
    },
  };

  const token = readToken();
  const agent = buildAgent();

  const url = `${K8S_API_URL}/apis/argoproj.io/v1alpha1/namespaces/${ARGO_WORKFLOWS_NAMESPACE}/workflows`;
  const bodyText = JSON.stringify(body);
  if (debug) {
    console.log("[DEBUG] K8s: Creating Workflow via Kubernetes API:", url);
    curlHint(url, bodyText);
  }

  const r = await fetch(url, {
    method: "POST",
    headers: headers(token),
    body: bodyText,
    agent,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`K8s create ${r.status}${text ? `: ${text}` : ""}`);
  }
  const resp = await r.json().catch(() => ({}));
  return { created: true, name: resp?.metadata?.name };
}

