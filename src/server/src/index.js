import express  from "express";
import dotenv   from "dotenv";
import path     from "path";
import { fileURLToPath } from "url";

import {
  listWorkflows,
  listTemplates,
  submitWorkflow,
  streamLogs,
  deleteWorkflow      // ← NEW
} from "./argo-workflows.js";

dotenv.config();
const app        = express();
const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";

app.use(express.json());

/* ---------- optional request logging ----------------------------- */
if (DEBUG_LOGS) {
  app.use((req, _res, next) => {
    console.log(`[DEBUG] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    next();
  });
}

/* ---------------- API routes ------------------------------------- */
app.get("/api/workflows", async (_req, res, next) => {
  try { res.json(await listWorkflows()); } catch (e) { next(e); }
});

app.get("/api/workflows/:name/logs", (req, res) =>
  streamLogs(req.params.name, res, req.query.follow !== "false")
);

app.delete("/api/workflows/:name", async (req, res, next) => {
  try {
    await deleteWorkflow(req.params.name);
    res.json({ deleted: true });
  } catch (e) { next(e); }
});

app.get("/api/templates", async (_req, res, next) => {
  try { res.json(await listTemplates()); } catch (e) { next(e); }
});

app.post("/api/workflows", async (req, res, next) => {
  try { res.json(await submitWorkflow(req.body)); } catch (e) { next(e); }
});

/* ---------------- static React build ----------------------------- */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../public")));
app.get("*", (_req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

/* ---------------- error handler ---------------------------------- */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

/* ---------------- start server ----------------------------------- */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
