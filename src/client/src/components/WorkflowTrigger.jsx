import React, { useEffect, useState, useCallback } from "react";
import { listTemplates, submitWorkflow } from "../api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
// --- Parse the ui.argoproj.io/parameters annotation ----------------
function parseParameterAnnotation(ann = "") {
  const defaults = {};
  if (!ann.trim()) return defaults;
  const lines = ann.split(/\r?\n/);
  let cur = null;
  lines.forEach((ln) => {
    const nm = ln.match(/^\s*-\s*name:\s*(\S+)/);
    if (nm) {
      cur = nm[1].replace(/^var_/, "");
      defaults[cur] = "";
      return;
    }
    if (cur) {
      const dv = ln.match(/^\s*defaultValue:\s*(.+)$/);
      if (dv) {
        let v = dv[1].trim().replace(/^['"]|['"]$/g, "");
        defaults[cur] = v;
        cur = null;
      }
    }
  });
  Object.keys(defaults).forEach((k) => {
    if (defaults[k] === "") delete defaults[k];
  });
  return defaults;
}
// --- Derive var_* params from steps --------------------------------
function deriveVarParameterDefaults(tmpl) {
  if (!tmpl?.spec?.templates?.length) return {};
  const prim = tmpl.spec.templates.find((t) => t.name === tmpl.metadata.name) || tmpl.spec.templates[0];
  if (!prim?.steps) return {};
  const out = {};
  prim.steps.flat().forEach((s) => {
    s.arguments?.parameters?.forEach((p) => {
      if (p.name?.startsWith("var_")) out[p.name.slice(4)] = "";
    });
  });
  return out;
}

export default function WorkflowTrigger({ onError = () => {} }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected]   = useState("");
  const [params, setParams]       = useState({});      // { name → string }
  const [infoMsg, setInfoMsg]     = useState("");
  const [hideTemp, setHideTemp]   = useState(true);
  const [description, setDescription] = useState("");
  const [rawView, setRawView]     = useState(false);   // false = form mode

  /* ------------ fetch templates -------------------------------- */
  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((e) =>
        onError(e.status === 403 ? "Access denied (HTTP 403)." : `Error: ${e.message}`)
      );
  }, [onError]);

  /* ------------ rebuild param map on template change ------------ */
  useEffect(() => {
    if (!selected) {
      setParams({});
      setDescription("");
      return;
    }
    const tmpl = templates.find((t) => t.metadata.name === selected);
    if (!tmpl) return;

    const derived = deriveVarParameterDefaults(tmpl);
    const annText = tmpl.metadata.annotations?.["ui.argoproj.io/parameters"];
    const annDef  = parseParameterAnnotation(annText);
    const defs    = { ...derived, ...annDef };

    const p = {};
    (tmpl.spec?.arguments?.parameters || []).forEach((pr) => {
      if (pr.name === "event-data") {
        p[pr.name] = JSON.stringify(Object.keys(defs).length ? defs : { key: "value" }, null, 2);
      } else {
        p[pr.name] = pr.value ?? "";
      }
    });
    setParams(p);

    const desc = tmpl.metadata.annotations?.description || tmpl.metadata.annotations?.["ui.argoproj.io/description"] || "";
    setDescription(desc);
  }, [selected, templates]);

  /* ------------ helpers ---------------------------------------- */
  const updateEventData = useCallback((obj) => {
    setParams((prev) => ({ ...prev, "event-data": JSON.stringify(obj, null, 2) }));
  }, []);

  const parseEventObj = () => {
    try {
      return JSON.parse(params["event-data"] || "{}");
    } catch {
      return {};
    }
  };

  const handleFieldChange = (k, v) => {
    const obj = parseEventObj();
    obj[k] = v;
    updateEventData(obj);
  };

  const handleSubmit = async () => {
    try {
      await submitWorkflow({ template: selected, parameters: params });
      setInfoMsg("✅ Workflow submitted!");
      setTimeout(() => setInfoMsg(""), 4000);
    } catch (e) {
      onError(e.status === 403 ? "Access denied – cannot submit" : e.message);
    }
  };

  const visibleTemplates = templates.filter((t) => !(hideTemp && t.metadata.name.startsWith("template-")));

  /* ------------ render ----------------------------------------- */
  return (
    <details className="filter-panel">
      <summary className="filter-title">Trigger Workflow</summary>
      <div style={{ padding: "0.75rem 1rem" }}>
        {/* picker */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "0.75rem" }}>
          <select className="trigger-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">-- choose template --</option>
            {visibleTemplates.map((t) => <option key={t.metadata.name}>{t.metadata.name}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", marginLeft: "1rem", gap: "0.4rem" }}>
            <input type="checkbox" checked={hideTemp} onChange={(e) => setHideTemp(e.target.checked)} />
            <span style={{ marginRight: "0.25rem" }}>Hide templates prefixed with</span><code>template-</code>
          </label>
        </div>

        {selected && (
          <div className="trigger-form">
            {/* Other parameters */}
            {Object.keys(params).filter((n) => n !== "event-data").map((name) => (
              <div key={name} className="field">
                <label>{name}</label>
                <input value={params[name]} onChange={(e) => setParams((p) => ({ ...p, [name]: e.target.value }))} />
              </div>
            ))}

            {/* event‑data special handling */}
            <div className="field">
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>event-data</span>
                <button type="button" className="btn-light" onClick={() => setRawView((r) => !r)}>
                  {rawView ? "Form" : "Raw"}
                </button>
              </label>

              {rawView ? (
                <textarea rows={4} value={params["event-data"]} onChange={(e) => setParams((p) => ({ ...p, "event-data": e.target.value }))} />
              ) : (
                Object.entries(parseEventObj()).map(([k, v]) => (
                  <div key={k} style={{ marginBottom: "0.5rem" }}>
                    <label style={{ display: "block", fontWeight: 500, marginBottom: "0.15rem" }}>{k}</label>
                    <input value={v} onChange={(e) => handleFieldChange(k, e.target.value)} />
                  </div>
                ))
              )}
            </div>

            <button className="btn" onClick={handleSubmit}>Submit</button>
            <span style={{ marginLeft: "0.75rem" }}>{infoMsg}</span>
          </div>
        )}

        {selected && description && (
          <div className="help-section" style={{ marginTop: "1.5rem" }}>
            <h3>Template Description</h3>
            <p>{description}</p>
          </div>
        )}
      </div>
    </details>
  );
}