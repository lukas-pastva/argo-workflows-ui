import React, { useEffect, useState } from "react";
import { listTemplates, submitWorkflow } from "../api";

/* ------------------------------------------------------------------ */
/*  Helpers: parse annotation and derive defaults for event-data       */
/* ------------------------------------------------------------------ */
function parseParameterAnnotation(ann) {
  const defaults = {};
  if (!ann) return defaults;
  // Split into blocks by '- name:' marker
  const blocks = ann.split(/^- name:/m).map(b => b.trim()).filter(Boolean);
  blocks.forEach(block => {
    // Extract name and defaultValue
    const nameMatch = block.match(/^name:\s*(\S+)/m);
    const defMatch  = block.match(/defaultValue:\s*(\S+)/m);
    if (nameMatch) {
      const key = nameMatch[1];
      const dv  = defMatch ? defMatch[1] : "";
      defaults[key] = dv;
    }
  });
  return defaults;
}

function deriveEventDefaults(tmpl) {
  // First, try annotation-based defaults
  const ann = tmpl.metadata.annotations?.["ui.argoproj.io/parameters"];
  const annDefaults = parseParameterAnnotation(ann);
  if (Object.keys(annDefaults).length > 0) {
    return annDefaults;
  }

  // Otherwise, fall back to var_* parameters in primary template
  if (!tmpl?.spec?.templates?.length) return {};
  const primary =
    tmpl.spec.templates.find(t => t.name === tmpl.metadata.name) ||
    tmpl.spec.templates[0];
  if (!primary?.steps) return {};
  const steps = primary.steps.flat();
  const derived = {};
  steps.forEach(s => {
    s.arguments?.parameters?.forEach(p => {
      if (typeof p.name === "string" && p.name.startsWith("var_")) {
        const key = p.name.slice(4);
        if (key) derived[key] = "";
      }
    });
  });
  return derived;
}

export default function WorkflowTrigger({ onError = () => {} }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected]   = useState("");
  const [params, setParams]       = useState({});
  const [infoMsg, setInfoMsg]     = useState("");
  const [hideTemp, setHideTemp]   = useState(true);
  const [description, setDescription] = useState("");

  /* ------------- load templates -------------------------------- */
  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch(e =>
        onError(
          e.status === 403
            ? "Access denied – cannot list workflow‑templates (HTTP 403)."
            : `Error loading templates: ${e.message}`
        )
      );
  }, [onError]);

  /* ------------- rebuild parameter form & description ----------- */
  useEffect(() => {
    if (!selected) {
      setParams({});
      setDescription("");
      return;
    }
    const tmpl = templates.find(t => t.metadata.name === selected);
    if (!tmpl) return;

    /* ---- build defaults --------------------------------------- */
    const eventDefaults = deriveEventDefaults(tmpl);
    const p = {};
    (tmpl.spec?.arguments?.parameters || []).forEach(par => {
      if (par.name === "event-data") {
        p[par.name] = JSON.stringify(
          Object.keys(eventDefaults).length > 0
            ? eventDefaults
            : { key: "value" },
          null,
          2
        );
      } else if (par.value) {
        p[par.name] = par.value;
      } else {
        p[par.name] = "";
      }
    });
    setParams(p);

    /* ---- description ------------------------------------------ */
    const desc =
      tmpl.metadata.annotations?.description ||
      tmpl.metadata.annotations?.["ui.argoproj.io/description"] ||
      tmpl.metadata.labels?.description ||
      "";
    setDescription(desc);
  }, [selected, templates]);

  /* ------------- handlers -------------------------------------- */
  const handleChange = (k, v) => setParams(o => ({ ...o, [k]: v }));

  const handleSubmit = async () => {
    try {
      await submitWorkflow({ template: selected, parameters: params });
      setInfoMsg("✅ Workflow submitted!");
      setTimeout(() => setInfoMsg(""), 4000);
    } catch (e) {
      onError(
        e.status === 403
          ? "Access denied – cannot submit workflows (HTTP 403)."
          : `Error submitting workflow: ${e.message}`
      );
    }
  };

  /* ------------- visible template list ------------------------- */
  const visibleTemplates = templates.filter(
    t => !(hideTemp && t.metadata.name.startsWith("template-"))
  );

  /* ------------- render ---------------------------------------- */
  return (
    <details className="filter-panel">
      <summary className="filter-title">Trigger Workflow</summary>
      <div style={{ padding: "0.75rem 1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <select
            className="trigger-select"
            onChange={e => setSelected(e.target.value)}
            value={selected}
          >
            <option value="">-- choose template --</option>
            {visibleTemplates.map(t => (
              <option key={t.metadata.name} value={t.metadata.name}>
                {t.metadata.name}
              </option>
            ))}
          </select>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              marginLeft: "1rem",
              gap: "0.4rem",
            }}
          >
            <input
              type="checkbox"
              checked={hideTemp}
              onChange={e => setHideTemp(e.target.checked)}
            />
            <span style={{ marginRight: "0.25rem" }}>
              Hide templates prefixed with
            </span>
            <code>template-</code>
          </label>
        </div>

        {selected && (
          <div className="trigger-form">
            {Object.keys(params).map(name => (
              <div key={name} className="field">
                <label>{name}</label>
                {name === "event-data" ? (
                  <textarea
                    rows={4}
                    value={params[name]}
                    onChange={e => handleChange(name, e.target.value)}
                  />
                ) : (
                  <input
                    value={params[name]}
                    onChange={e => handleChange(name, e.target.value)}
                  />
                )}
              </div>
            ))}

            <button className="btn" onClick={handleSubmit}>
              Submit
            </button>
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
