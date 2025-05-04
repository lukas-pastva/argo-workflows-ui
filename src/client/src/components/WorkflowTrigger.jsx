import React, { useEffect, useState, useCallback } from "react";
import { listTemplates, submitWorkflow } from "../api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function parseParameterAnnotation(ann = "") {
  const defaults = {};
  if (!ann.trim()) return defaults;
  const lines = ann.split(/\r?\n/);
  let cur = null;
  lines.forEach((ln) => {
    const nm = ln.match(/^[\s-]*name:\s*(\S+)/);
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
  Object.keys(defaults).forEach((k) => { if (defaults[k] === "") delete defaults[k]; });
  return defaults;
}
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
  const [params, setParams]       = useState({});
  const [infoMsg, setInfoMsg]     = useState("");
  const [hideTemp, setHideTemp]   = useState(true);
  const [description, setDescription] = useState("");
  const [rawView, setRawView]     = useState(false);

  /* ---------- fetch templates --------------------------------- */
  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((e) => onError(e.status === 403 ? "Access denied (HTTP 403)." : e.message));
  }, [onError]);

  /* ---------- rebuild param map ------------------------------- */
  useEffect(() => {
    if (!selected) { setParams({}); setDescription(""); return; }
    const tmpl = templates.find((t) => t.metadata.name === selected);
    if (!tmpl) return;

    const defs = { ...deriveVarParameterDefaults(tmpl), ...parseParameterAnnotation(tmpl.metadata.annotations?.["ui.argoproj.io/parameters"]) };
    const p = {};
    (tmpl.spec?.arguments?.parameters || []).forEach((pr) => {
      if (pr.name === "event-data") {
        // include only if we actually have some defaults or a template-supplied value
        if (Object.keys(defs).length > 0) {
          p[pr.name] = JSON.stringify(defs, null, 2);
        } else if (pr.value) {
          p[pr.name] = pr.value;
        }
      } else {
        p[pr.name] = pr.value ?? "";
      }
    });
    setParams(p);

    setDescription(tmpl.metadata?.annotations?.description || tmpl.metadata?.annotations?.["ui.argoproj.io/description"] || "");
  }, [selected, templates]);

  /* ---------- event‑data helpers ------------------------------ */
  const updateEventData = useCallback((obj) => setParams((pr) => ({ ...pr, "event-data": JSON.stringify(obj, null, 2) })), []);
  const eventObj = () => { try { return JSON.parse(params["event-data"] || "{}"); } catch { return {}; } };
  const handleFieldChange = (k, v) => { const o = eventObj(); o[k] = v; updateEventData(o); };

  const handleSubmit = async () => {
    try {
      await submitWorkflow({ template: selected, parameters: params });
      setInfoMsg("✅ Workflow submitted!");
      setTimeout(() => setInfoMsg(""), 3500);
    } catch (e) {
      onError(e.status === 403 ? "Access denied – cannot submit." : e.message);
    }
  };

  const visibleTemplates = templates.filter((t) => !(hideTemp && t.metadata.name.startsWith("template-")));

  /* ---------- styles ------------------------------------------ */
  const panelWidth = "50%";
  const boxStyle = { width: panelWidth, minWidth: 320, maxWidth: 640, marginLeft: 0 };
  const formStyle = { border: "1px solid #cbd5e1", borderRadius: 6, padding: "1rem", marginBottom: "0.75rem" };

  /* ---------- render ------------------------------------------ */
  return (
    <details className="filter-panel" style={boxStyle}>
      <summary className="filter-title">Trigger Workflow</summary>
      <div style={{ padding: "0.75rem 1rem" }}>
        {/* template picker + description */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <select className="trigger-select" style={{ flexShrink: 0 }} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">-- choose template --</option>
            {visibleTemplates.map((t) => <option key={t.metadata.name}>{t.metadata.name}</option>)}
          </select>
          {selected && description && <span style={{ fontStyle: "italic", opacity: 0.7 }}>{description}</span>}
        </div>

        {/* params form */}
        {selected && (
          <div className="trigger-form" style={formStyle}>
            {Object.keys(params).filter((n) => n !== "event-data").map((name) => (
              <div key={name} className="field">
                <label>{name}</label>
                <input value={params[name]} onChange={(e) => setParams((p) => ({ ...p, [name]: e.target.value }))} />
              </div>
            ))}

            {/* event-data section only if present */}
            {params["event-data"] !== undefined && (
              <div className="field">
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>event-data</span>
                  <button type="button" className="btn-light" style={{ fontSize: "0.8rem", padding: "0.2rem 0.6rem" }} onClick={() => setRawView((r) => !r)}>
                    {rawView ? "Form" : "Raw"}
                  </button>
                </label>
                {rawView ? (
                  <textarea rows={4} value={params["event-data"]} onChange={(e) => setParams((p) => ({ ...p, "event-data": e.target.value }))} />
                ) : (
                  Object.entries(eventObj()).map(([k, v]) => (
                    <div key={k} style={{ marginBottom: "0.5rem" }}>
                      <label style={{ display: "block", fontWeight: 500, marginBottom: 4 }}>{k}</label>
                      <input value={v} onChange={(e) => handleFieldChange(k, e.target.value)} />
                    </div>
                  ))
                )}
              </div>
            )}

            <button className="btn" onClick={handleSubmit}>Submit</button>
            <span style={{ marginLeft: "0.75rem" }}>{infoMsg}</span>
          </div>
        )}

        {/* hide-template toggle at bottom */}
        <div style={{ fontSize: "0.85rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <input type="checkbox" checked={hideTemp} onChange={(e) => setHideTemp(e.target.checked)} />
            <span>Hide templates prefixed with <code>template-</code></span>
          </label>
        </div>
      </div>
    </details>
  );
}