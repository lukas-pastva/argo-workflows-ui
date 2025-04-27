import React, { useEffect, useState } from "react";
import { listTemplates, submitWorkflow } from "../api";

export default function WorkflowTrigger({ onError = () => {} }) {
  const [templates , setTemplates]  = useState([]);
  const [selected  , setSelected]   = useState("");
  const [params    , setParams]     = useState({});
  const [infoMsg   , setInfoMsg]    = useState("");
  const [hideTemp  , setHideTemp]   = useState(true);  // ⬅ default-checked

  /* ---------- load templates ---------- */
  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((e) =>
        onError(
          e.status === 403
            ? "Access denied – not allowed to list workflow-templates (HTTP 403)."
            : `Error loading templates: ${e.message}`
        )
      );
  }, [onError]);

  /* ---------- when template changes ---------- */
  useEffect(() => {
    if (!selected) return;
    const tmpl = templates.find((t) => t.metadata.name === selected);
    if (!tmpl) return;

    const p = {};
    (tmpl.spec?.arguments?.parameters || []).forEach((par) => {
      let defVal = par.value || "";
      if (par.name === "event-data" && !defVal) {
        defVal = JSON.stringify({ key: "value" }, null, 2);
      }
      p[par.name] = defVal;
    });
    setParams(p);
  }, [selected, templates]);

  /* ---------- helpers ---------- */
  const handleChange  = (k, v) => setParams((o) => ({ ...o, [k]: v }));
  const handleSubmit  = async () => {
    try {
      await submitWorkflow({ template: selected, parameters: params });
      setInfoMsg("✅ Workflow submitted!");
      setTimeout(() => setInfoMsg(""), 4000);
    } catch (e) {
      onError(
        e.status === 403
          ? "Access denied – can’t submit workflows (HTTP 403)."
          : `Error submitting workflow: ${e.message}`
      );
    }
  };

  /* ---------- filter templates ---------- */
  const visibleTemplates = templates.filter(
    (t) => !(hideTemp && t.metadata.name.startsWith("template-"))
  );

  /* ---------- render ---------- */
  return (
    <>
      <h2>Trigger Workflow</h2>

      <label style={{ display: "block", marginBottom: "0.5rem" }}>
        <input
          type="checkbox"
          checked={hideTemp}
          onChange={(e) => setHideTemp(e.target.checked)}
          style={{ marginRight: "0.4rem" }}
        />
        Hide templates prefixed with <code>template-</code>
      </label>

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
    </>
  );
}
