import fs   from "fs";
import path from "path";
import YAML from "yaml";

/*
 * Dynamic read-only visibility derived from a "security groups mapping" file.
 *
 * The file has the shape used by helm-charts-mapping-security:
 *
 *   defaultROMappingSecurityGroups: [ <group-id>, ... ]   # cluster-wide groups → never filtered
 *   defaultRWMappingSecurityGroups: [ <group-id>, ... ]
 *   mappingSecurityGroups:
 *     - namespacePrefix: eai-ppt
 *       groupsRO: [ <group-id>, ... ]
 *       groupsRW: [ <group-id>, ... ]
 *
 * Every group listed under an entry is allowed to see workflows that belong to
 * that namespace prefix (workflow label `application` starts with the prefix or
 * the workflow name contains it). JSON is accepted as well (JSON is YAML).
 *
 * The file is re-read periodically (and on fs events when available) so a
 * ConfigMap update is picked up without restarting the process.
 */

function asList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return [String(v).trim()].filter(Boolean);
}

/** Build { groupId: [namespacePrefix, ...] } from a parsed mapping document. */
export function buildGroupPrefixMap(doc, { excludeGroups = [] } = {}) {
  const exclude = new Set([
    ...asList(doc?.defaultROMappingSecurityGroups),
    ...asList(doc?.defaultRWMappingSecurityGroups),
    ...asList(excludeGroups),
  ]);
  const out = {};
  const entries = Array.isArray(doc?.mappingSecurityGroups) ? doc.mappingSecurityGroups : [];
  for (const e of entries) {
    const prefix = String(e?.namespacePrefix || "").trim();
    if (!prefix) continue;
    for (const g of [...asList(e.groupsRO), ...asList(e.groupsRW)]) {
      if (exclude.has(g)) continue;
      const list = out[g] || (out[g] = []);
      if (!list.includes(prefix)) list.push(prefix);
    }
  }
  for (const list of Object.values(out)) list.sort();
  return out;
}

export function parseMappingText(text) {
  const doc = YAML.parse(String(text || ""));
  if (!doc || typeof doc !== "object") throw new Error("mapping file is empty or not an object");
  if (!Array.isArray(doc.mappingSecurityGroups)) {
    throw new Error("mapping file has no mappingSecurityGroups list");
  }
  return doc;
}

/**
 * Watch a mapping file and keep an up-to-date group → prefixes map in memory.
 * A broken file never replaces the last good map; the error is only logged.
 */
export function createMappingWatcher({
  file,
  refreshSeconds = 30,
  excludeGroups = [],
  log = console,
} = {}) {
  if (!file) throw new Error("createMappingWatcher: file is required");

  let map       = {};
  let defaults  = { ro: [], rw: [] };   // cluster-wide groups from the default* lists
  let lastRaw   = null;   // content of the last successfully applied file
  let lastSeen  = null;   // content seen on the last read (good or bad), avoids re-logging
  let lastError = null;
  let loadedAt  = null;
  let timer     = null;
  let fsWatcher = null;
  let debounce  = null;

  function reload({ force = false } = {}) {
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch (e) {
      // Transient read errors happen while kubelet swaps the ConfigMap symlink.
      if (lastRaw === null) log.error(`[mapping] cannot read ${file}: ${e.message}`);
      lastError = e.message;
      return false;
    }
    if (!force && raw === lastSeen) return false;
    lastSeen = raw;
    try {
      const doc = parseMappingText(raw);
      map       = buildGroupPrefixMap(doc, { excludeGroups });
      defaults  = {
        ro: asList(doc.defaultROMappingSecurityGroups),
        rw: asList(doc.defaultRWMappingSecurityGroups),
      };
      lastRaw   = raw;
      lastError = null;
      loadedAt  = new Date();
      const groups   = Object.keys(map).length;
      const prefixes = new Set(Object.values(map).flat()).size;
      log.log(`[mapping] loaded ${file}: ${groups} groups, ${prefixes} namespace prefixes`);
      return true;
    } catch (e) {
      lastError = e.message;
      log.error(`[mapping] ignoring invalid ${file}: ${e.message}`);
      return false;
    }
  }

  function scheduleReload() {
    clearTimeout(debounce);
    debounce = setTimeout(() => reload(), 500);
    debounce.unref?.();
  }

  reload({ force: true });

  const everyMs = Math.max(1, Number(refreshSeconds) || 30) * 1000;
  timer = setInterval(() => reload(), everyMs);
  timer.unref?.();

  // Best effort: react to ConfigMap updates faster than the poll interval.
  // Kubernetes swaps a `..data` symlink inside the mount directory, so watch the dir.
  try {
    fsWatcher = fs.watch(path.dirname(file), { persistent: false }, scheduleReload);
    fsWatcher.on("error", () => { try { fsWatcher.close(); } catch {/* ignore */} fsWatcher = null; });
  } catch {/* polling fallback only */}

  return {
    file,
    /** Prefixes the given group may see (empty array → group is not in the mapping). */
    prefixesFor(group) { return map[group] || []; },
    /** Union of prefixes for all given groups. */
    prefixesForGroups(groups) {
      const set = new Set();
      for (const g of groups || []) for (const p of map[g] || []) set.add(p);
      return [...set];
    },
    getMap() { return map; },
    /** Groups from defaultROMappingSecurityGroups (cluster-wide readonly). */
    defaultReadOnlyGroups() { return defaults.ro; },
    /** Groups from defaultRWMappingSecurityGroups (cluster-wide, never narrowed). */
    defaultReadWriteGroups() { return defaults.rw; },
    status() {
      return {
        file,
        loadedAt: loadedAt ? loadedAt.toISOString() : null,
        groups  : Object.keys(map).length,
        error   : lastError,
      };
    },
    reload,
    stop() {
      clearInterval(timer);
      clearTimeout(debounce);
      try { fsWatcher?.close(); } catch {/* ignore */}
    },
  };
}
