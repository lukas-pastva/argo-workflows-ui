// src/client/src/components/WorkflowTrigger.jsx

import React, { useEffect, useState } from "react";
import { listTemplates, submitWorkflow } from "../api";

export default function WorkflowTrigger({ onError = () => {} }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected]   = useState("");
  const [params, setParams]       = useState({});
  const [infoMsg, setInfoMsg]     = useState("");
  const [hideTemp, setHideTemp]   = useState(true);
  const [helpText, setHelpText]   = useState("");

  /* ------------- load templates -------------------------------- */
  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((e) =>
        onError(
          e.status === 403
            ? "Access denied – cannot list workflow-templates (HTTP 403)."
            : `Error loading templates: ${e.message}`
        )
      );
  }, [onError]);

  /* ------------- rebuild parameter form & help on template change */
  useEffect(() => {
    if (!selected) {
      setParams({});
      setHelpText("");
      return;
    }
    const tmpl = templates.find((t) => t.metadata.name === selected);
    if (!tmpl) return;

    // --- parse default-values annotation (JSON) ---
    const defaultsAnn =
      tmpl.metadata.annotations?.["ui.argoproj.io/default-values"] ||
      tmpl.metadata.annotations?.defaultValues ||
      "";
    let defaultValues = {};
    if (defaultsAnn) {
      try {
        defaultValues = JSON.parse(defaultsAnn);
      } catch {
        console.warn(
          "[WorkflowTrigger] failed to parse default-values annotation",
          defaultsAnn
        );
      }
    }

    // Rebuild parameters, applying default-values first, then fallback to spec or event-data
    const p = {};
    (tmpl.spec?.arguments?.parameters || []).forEach((par) => {
      let defVal = "";
      if (defaultValues[par.name] !== undefined) {
        defVal = defaultValues[par.name];
      } else if (par.value) {
        defVal = par.value;
      } else if (par.name === "event-data") {
        defVal = JSON.stringify({ key: "value" }, null, 2);
      }
      p[par.name] = defVal;
    });
    setParams(p);

    // Extract help text from annotation or label
    const help =
      tmpl.metadata.annotations?.help ||
      tmpl.metadata.annotations?.["ui.argoproj.io/help"] ||
      tmpl.metadata.labels?.help ||
      "";
    setHelpText(help);
  }, [selected, templates]);

  /* ------------- handlers -------------------------------------- */
  const handleChange = (k, v) => setParams((o) => ({ ...o, [k]: v }));

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
    (t) => !(hideTemp && t.metadata.name.startsWith("template-"))
  );

  /* ------------- render ---------------------------------------- */
  return (
    <details className="filter-panel">
      <summary className="filter-title">Trigger Workflow</summary>

      <div style={{ padding: "0.75rem 1rem" }}>
        {/* dropdown + hide-template checkbox */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <select
            className="trigger-select"
            onChange={(e) => setSelected(e.target.value)}
            value={selected}
          >
            <option value="">-- choose template --</option>
            {visibleTemplates.map((t) => (
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
              onChange={(e) => setHideTemp(e.target.checked)}
            />
            <span style={{ marginRight: "0.25rem" }}>
              Hide templates prefixed with
            </span>
            <code>template-</code>
          </label>
        </div>

        {/* parameter form */}
        {selected && (
          <div className="trigger-form">
            {Object.keys(params).map((name) => (
              <div key={name} className="field">
                <label>{name}</label>
                {name === "event-data" ? (
                  <textarea
                    rows={4}
                    value={params[name]}
                    onChange={(e) => handleChange(name, e.target.value)}
                  />
                ) : (
                  <input
                    value={params[name]}
                    onChange={(e) => handleChange(name, e.target.value)}
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

        {/* INLINE HELP SECTION */}
        {selected && helpText && (
          <div className="help-section" style={{ marginTop: "1.5rem" }}>
            <h3>Template Help</h3>
            <p>{helpText}</p>
          </div>
        )}
      </div>
    </details>
  );
}
