import express from "express";
import dotenv  from "dotenv";
import path    from "path";
import { fileURLToPath } from "url";
import fetch   from "node-fetch";   // ⬅️ new – used for Tailwind proxy

import {
  listWorkflows,
  listTemplates,
  submitWorkflow,
  streamLogs,
  deleteWorkflow,
} from "./argo-workflows.js";

dotenv.config();
const app        = express();
const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";

app.use(express.json());

if (DEBUG_LOGS) {
  app.use((req, _res, next) => {
    console.log(
      `[DEBUG] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`
    );
    next();
  });
}

/* ─── Runtime config endpoint ─────────────────────────────────── */
app.get("/env.js", (_req, res) => {
  const cfg = {
    skipLabels: process.env.VITE_SKIP_LABELS            || "",
    collapsedLabelGroups: process.env.VITE_COLLAPSED_LABEL_GROUPS || "",
    labelPrefixTrim: process.env.VITE_LABEL_PREFIX_TRIM || "",
    headerBg: process.env.VITE_HEADER_BG                || "",
  };
  res.setHeader("Content-Type", "application/javascript");
  res.send(`window.__ENV__ = ${JSON.stringify(cfg)};`);
});

/* ─── API routes ──────────────────────────────────────────────── */
app.get("/api/workflows", async (_req, res, next) => {
  try { res.json(await listWorkflows()); } catch (e) { next(e); }
});

app.get("/api/workflows/:name/logs", (req, res) =>
  streamLogs(req.params.name, res, req.query.follow !== "false")
);

app.delete("/api/workflows/:name", async (req, res, next) => {
  try { await deleteWorkflow(req.params.name); res.json({ deleted: true }); }
  catch (e) { next(e); }
});

app.get("/api/templates", async (_req, res, next) => {
  try { res.json(await listTemplates()); } catch (e) { next(e); }
});

app.post("/api/workflows", async (req, res, next) => {
  try { res.json(await submitWorkflow(req.body)); } catch (e) { next(e); }
});

/* ─── Tailwind CDN proxy (fixes CORS / CSP) ───────────────────── */
const TW_URL = "https://cdn.tailwindcss.com";
app.get("/tailwind.js", async (_req, res, next) => {
  try {
    const up = await fetch(TW_URL);
    if (!up.ok) throw new Error(`Tailwind fetch failed (${up.status})`);
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "public,max-age=86400"); // 24 h
    up.body.pipe(res);
  } catch (e) { next(e); }
});

/* ─── Serve frontend ──────────────────────────────────────────── */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../public")));
app.get("*", (_req, res) =>
  res.sendFile(path.join(__dirname, "../public/index.html"))
);

/* ─── Error handler ───────────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

/* ─── Start server ────────────────────────────────────────────── */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
