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
  listPodEventsForWorkflow,
} from "./argo-workflows.js";
import { createWorkflow } from "./create/index.js";
import { createMappingWatcher } from "./security-mapping.js";

dotenv.config();
const app = express();
const DEBUG_LOGS = process.env.DEBUG_LOGS === "true";

app.use(express.json());

/* ─── Auth/role helpers (derived from oauth2-proxy headers) ──────── */
function parseListEnv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
  } catch {/* not JSON */}
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

// Map parser: supports JSON object or comma/semicolon separated pairs like
// "group1=foo,group2:bar". Values can be delimited by "|" for multiple filters.
function parseMapEnv(name) {
  const raw = process.env[name];
  if (!raw) return {};
  const s = String(raw).trim();
  if (!s) return {};
  // Prefer JSON object
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
  } catch {/* not JSON */}
  const out = {};
  // Split into entries by comma or semicolon
  const entries = s.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  for (const e of entries) {
    const m = e.split(/[:=]/);
    if (m.length >= 2) {
      const k = String(m.shift()).trim();
      const v = m.join(":").trim();
      if (!k) continue;
      out[k] = v;
    }
  }
  return out;
}

const READONLY_GROUPS  = parseListEnv("READONLY_GROUPS");
const READWRITE_GROUPS = parseListEnv("READWRITE_GROUPS");
// Optional: fine-grained readonly filters mapping group -> name substring(s)
// Accepts JSON object { "group": "substr" } or { "group": ["a","b"] }
// Also supports simple text like: group=sub|other=foo|bar
const READONLY_NAME_FILTERS_RAW = parseMapEnv("READONLY_NAME_FILTERS");

function normalizeFiltersMap(obj) {
  const out = {};
  for (const [g, val] of Object.entries(obj || {})) {
    if (Array.isArray(val)) {
      const list = val.map((x) => String(x).trim()).filter(Boolean);
      if (list.length) out[g] = list;
    } else if (typeof val === "string") {
      // allow "foo|bar" to express multiple values in non-JSON syntax
      const list = val
        .split("|")
        .map((x) => x.trim())
        .filter(Boolean);
      if (list.length) out[g] = list;
    }
  }
  return out;
}
const READONLY_NAME_FILTERS = normalizeFiltersMap(READONLY_NAME_FILTERS_RAW);

// Optional: dynamic readonly visibility from a security-groups mapping file
// (namespacePrefix -> groups). Re-read periodically, no restart needed.
const READONLY_MAPPING_FILE  = (process.env.READONLY_MAPPING_FILE || "").trim();
const READONLY_MAPPING_LABEL = (process.env.READONLY_MAPPING_LABEL || "application").trim();
const READONLY_MAPPING_REFRESH_SECONDS = parseInt(process.env.READONLY_MAPPING_REFRESH_SECONDS || "30", 10) || 30;
const mappingWatcher = READONLY_MAPPING_FILE
  ? createMappingWatcher({
      file          : READONLY_MAPPING_FILE,
      refreshSeconds: READONLY_MAPPING_REFRESH_SECONDS,
      // Groups with explicit cluster-wide roles are never narrowed by the mapping
      excludeGroups : [...READONLY_GROUPS, ...READWRITE_GROUPS],
    })
  : null;

function parseGroupsHeader(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.flatMap(parseGroupsHeader);
  const s = String(val).trim();
  if (!s) return [];
  // Comma-separated list as emitted by oauth2-proxy set_xauthrequest
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function requestGroups(req) {
  const h = req.headers || {};
  // Use X-Auth-Request-Groups provided via nginx auth_request + oauth2-proxy
  const groups = parseGroupsHeader(h["x-auth-request-groups"]);
  return Array.from(new Set(groups));
}

// Cluster-wide readonly groups: READONLY_GROUPS env plus defaultROMappingSecurityGroups
// from the mapping file. Members see everything (readonly), never narrowed by prefixes.
function readOnlyGroups() {
  return [...READONLY_GROUPS, ...(mappingWatcher ? mappingWatcher.defaultReadOnlyGroups() : [])];
}

// Groups whose members are never narrowed by the mapping (cluster-wide roles).
function clusterWideGroups() {
  return [
    ...readOnlyGroups(),
    ...READWRITE_GROUPS,
    ...(mappingWatcher ? mappingWatcher.defaultReadWriteGroups() : []),
  ];
}

function decideRole(groups) {
  const roGroups = readOnlyGroups();
  const hasWrite = READWRITE_GROUPS.length > 0 && groups.some((g) => READWRITE_GROUPS.includes(g));
  const hasRead  = roGroups.length  > 0 && groups.some((g) => roGroups.includes(g));
  if (hasWrite) return "readwrite";
  if (hasRead)  return "readonly";
  // If nothing is configured, default to readwrite to preserve current behavior
  if (roGroups.length === 0 && READWRITE_GROUPS.length === 0 && !mappingWatcher) return "readwrite";
  // Configured but user not in any → readonly by default
  return "readonly";
}

function attachAuth(req, _res, next) {
  const groups = requestGroups(req);
  // Compute name filters for readonly users if any of their groups are present
  // Union filters from all matching groups
  const filters = [];
  for (const g of groups) {
    const arr = READONLY_NAME_FILTERS[g];
    if (Array.isArray(arr)) filters.push(...arr);
  }
  // Namespace prefixes from the dynamic mapping file (union over all groups)
  const prefixFilters = mappingWatcher ? mappingWatcher.prefixesForGroups(groups) : [];
  // A member of a cluster-wide group (e.g. Cluster_Reader) is never narrowed,
  // even when also a member of a team group.
  const wide = clusterWideGroups();
  const clusterWide = groups.some((g) => wide.includes(g));
  req.auth = {
    groups,
    role: decideRole(groups),
    nameFilters  : clusterWide ? [] : filters,
    prefixFilters: clusterWide ? [] : prefixFilters,
  };
  next();
}

/* ─── Readonly visibility checks ─────────────────────────────────── */
function authOf(req) {
  if (req?.auth) return req.auth;
  const groups = requestGroups(req);
  return { groups, role: decideRole(groups), nameFilters: [], prefixFilters: [] };
}

// A readonly user is "restricted" when at least one of their groups has filters.
// Readonly users without any filters keep full readonly visibility.
function isRestricted(auth) {
  return auth.role === "readonly"
    && ((auth.nameFilters?.length || 0) + (auth.prefixFilters?.length || 0)) > 0;
}

// Static filters: substring on name or any top-level parameter value.
// Mapping prefixes: label `application` starts with prefix, or name contains it.
function workflowAllowed(auth, wf) {
  const name   = String(wf?.metadata?.name ?? "");
  const params = wf?.spec?.arguments?.parameters || [];
  const names  = auth.nameFilters || [];
  if (names.length) {
    const hit = (val) => names.some((s) => String(val ?? "").includes(s));
    if (hit(name)) return true;
    if (params.some((p) => hit(p?.value))) return true;
  }
  const prefixes = auth.prefixFilters || [];
  if (prefixes.length) {
    const label = String(wf?.metadata?.labels?.[READONLY_MAPPING_LABEL] ?? "");
    if (prefixes.some((p) => (label && label.startsWith(p)) || name.includes(p))) return true;
  }
  return false;
}

// Resolve access to a single workflow by name. Fetches the workflow when the
// decision cannot be made from the name alone. Returns { allowed, wf, status }.
async function authorizeWorkflow(req, name) {
  const auth = authOf(req);
  if (!isRestricted(auth)) return { allowed: true, wf: null };
  if (workflowAllowed(auth, { metadata: { name } })) return { allowed: true, wf: null };
  let wf;
  try { wf = await getWorkflow(name); }
  catch { return { allowed: false, status: 404 }; }
  return workflowAllowed(auth, wf) ? { allowed: true, wf } : { allowed: false, status: 403 };
}

function requireWriteAccess(req, res, next) {
  const role = req?.auth?.role || decideRole(requestGroups(req));
  if (role !== "readwrite") return res.status(403).json({ error: "Forbidden" });
  next();
}

app.use(attachAuth);

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
app.get("/env.js", (req, res) => {
  const cfg = {
    skipLabels              : process.env.VITE_SKIP_LABELS               || "",
    collapsedLabelGroups    : process.env.VITE_COLLAPSED_LABEL_GROUPS    || "",
    labelPrefixTrim         : process.env.VITE_LABEL_PREFIX_TRIM         || "",
    headerBg                : process.env.VITE_HEADER_BG                 || "",
    listLabelColumns        : process.env.VITE_LIST_LABEL_COLUMNS        || "",
    useUtcTime              : process.env.VITE_USE_UTC_TIME              || "",
    showRawButton           : process.env.VITE_SHOW_RAW_BUTTON           || "",
    showHideTemplateCheckbox: process.env.VITE_SHOW_HIDE_TEMPLATE_CHECKBOX || "",
    // Permissions derived from oauth2-proxy group headers
    role                    : (req?.auth?.role) || decideRole(requestGroups(req)),
  };
  // Convenience booleans for UI logic
  cfg.canSubmit = cfg.role !== "readonly";
  cfg.canDelete = cfg.role !== "readonly";
  res.setHeader("Content-Type", "application/javascript");
  res.send(`window.__ENV__ = ${JSON.stringify(cfg)};`);
});


/* ─── Who am I (role + effective visibility filters) ──────────────── */
app.get("/api/me", (req, res) => {
  const auth = authOf(req);
  res.json({
    groups : auth.groups,
    role   : auth.role,
    filters: { names: auth.nameFilters || [], prefixes: auth.prefixFilters || [] },
    mapping: mappingWatcher ? mappingWatcher.status() : null,
  });
});

/* ─── API routes ─────────────────────────────────────── */
/* Always returns { items, nextCursor } and supports ?limit&cursor */
app.get("/api/workflows", async (req, res, next) => {
  try {
    const limit  = req.query?.limit  ? Math.max(1, parseInt(req.query.limit, 10)  || 0) : undefined;
    const cursor = typeof req.query?.cursor === "string" ? req.query.cursor : "";
    const includeNodes = String(req.query?.nodes || "").toLowerCase() === "true";
    const result = await listWorkflows({ limit, cursor, includeNodes });
    const auth = authOf(req);
    if (isRestricted(auth)) {
      const filteredItems = (result.items || []).filter((it) => workflowAllowed(auth, it));
      res.json({ items: filteredItems, nextCursor: result.nextCursor || null });
    } else {
      res.json(result);
    }
  } catch (e) { next(e); }
});

app.get("/api/workflows/:name/logs", async (req, res, next) => {
  try {
    const access = await authorizeWorkflow(req, String(req.params.name || ""));
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.status === 404 ? "Not Found" : "Forbidden" });
    }
    // Forward *all* query-string params (follow, container, nodeId…)
    return streamLogs(req.params.name, res, req.query);
  } catch (e) { next(e); }
});

app.get("/api/workflows/:name/events", async (req, res, next) => {
  try {
    const access = await authorizeWorkflow(req, String(req.params.name || ""));
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.status === 404 ? "Not Found" : "Forbidden" });
    }

    const { nodeId, podName } = req.query || {};
    const result = await listPodEventsForWorkflow(req.params.name, { nodeId, podName });
    res.json(result);
  } catch (e) { next(e); }
});

app.get("/api/workflows/:name", async (req, res, next) => {
  try {
    const name = String(req.params.name || "");
    const access = await authorizeWorkflow(req, name);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.status === 404 ? "Not Found" : "Forbidden" });
    }
    // Reuse the workflow fetched during the permission check when available
    res.json(access.wf || await getWorkflow(name));
  } catch (e) { next(e); }
});

app.delete("/api/workflows/:name", requireWriteAccess, async (req, res, next) => {
  try { await deleteWorkflow(req.params.name); res.json({ deleted: true }); }
  catch (e) { next(e); }
});

app.get("/api/templates", async (_req, res, next) => {
  try { res.json(await listTemplates()); } catch (e) { next(e); }
});

/* Submissions use provider selected by CREATE_MODE (events|k8s) */
app.post("/api/workflows", requireWriteAccess, async (req, res, next) => {
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
