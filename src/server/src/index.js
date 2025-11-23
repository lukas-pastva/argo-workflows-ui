import express from "express";
import dotenv  from "dotenv";
import path    from "path";
import { fileURLToPath } from "url";

import {
  listWorkflows,
  listTemplates,
  streamLogs,
  deleteWorkflow,
  getWorkflow,
} from "./argo-workflows.js";
import { createWorkflow } from "./create/index.js";

dotenv.config();
const app = express();
const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";

app.use(express.json());

/* ─── tiny request logger when DEBUG_LOGS=true ───────────────────── */
if (DEBUG_LOGS) {
  app.use((req, _res, next) => {
    console.log(
      `[DEBUG] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`
    );
    next();
  });
}

/* ─── Runtime config exposed for the SPA ─────────────────────────── */
app.get("/env.js", (_req, res) => {
  const cfg = {
    skipLabels           : process.env.VITE_SKIP_LABELS            || "",
    collapsedLabelGroups : process.env.VITE_COLLAPSED_LABEL_GROUPS || "",
    labelPrefixTrim      : process.env.VITE_LABEL_PREFIX_TRIM      || "",
    headerBg             : process.env.VITE_HEADER_BG              || "",
    listLabelColumns     : process.env.VITE_LIST_LABEL_COLUMNS     || "",
    useUtcTime           : process.env.VITE_USE_UTC_TIME           || "",
  };
  res.setHeader("Content-Type", "application/javascript");
  res.send(`window.__ENV__ = ${JSON.stringify(cfg)};`);
});

/* ─── API routes ─────────────────────────────────────── */
/* Always returns { items, nextCursor } and supports ?limit&cursor */
app.get("/api/workflows", async (req, res, next) => {
  try {
    const limit  = req.query?.limit  ? Math.max(1, parseInt(req.query.limit, 10)  || 0) : undefined;
    const cursor = typeof req.query?.cursor === "string" ? req.query.cursor : "";
    const result = await listWorkflows({ limit, cursor });
    res.json(result);
  } catch (e) { next(e); }
});

app.get("/api/workflows/:name/logs", (req, res) =>
  // Forward *all* query-string params (follow, container, nodeId…)
  streamLogs(req.params.name, res, req.query)
);

app.get("/api/workflows/:name", async (req, res, next) => {
  try { res.json(await getWorkflow(req.params.name)); } catch (e) { next(e); }
});

app.delete("/api/workflows/:name", async (req, res, next) => {
  try { await deleteWorkflow(req.params.name); res.json({ deleted: true }); }
  catch (e) { next(e); }
});

app.get("/api/templates", async (_req, res, next) => {
  try { res.json(await listTemplates()); } catch (e) { next(e); }
});

/* Submissions use provider selected by CREATE_MODE (events|k8s) */
app.post("/api/workflows", async (req, res, next) => {
  try { res.json(await createWorkflow(req.body)); } catch (e) { next(e); }
});

/* ─── Serve compiled front-end ───────────────────────── */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../public")));
app.get("*", (_req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

/* ─── Central error handler & server start  ───────────── */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

/* ─── Start server ───────────────────────────────────────────────── */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
