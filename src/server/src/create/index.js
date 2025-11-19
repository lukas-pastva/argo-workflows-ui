import { createViaEvents } from "./events-webhook.js";
import { createViaK8s } from "./k8s-api.js";

const { CREATE_MODE = "events", DEBUG_LOGS = "false" } = process.env;
const debug = DEBUG_LOGS === "true";

export async function createWorkflow(body) {
  const mode = String(CREATE_MODE).toLowerCase();
  if (debug) console.log(`[DEBUG] createWorkflow mode=${mode}`);
  if (mode === "k8s") return createViaK8s(body);
  // default: events webhook
  return createViaEvents(body);
}

