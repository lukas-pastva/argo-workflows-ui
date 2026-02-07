/* WorkflowTrigger – pick a WorkflowTemplate, fill in parameters,
   hit "Insert". Dropdown suggestions are harvested from past runs. */

import React, {
  useEffect,
  useState,
  useRef
} from "react";
import {
  listTemplates,
  submitWorkflow,
  listWorkflows
} from "../api";
import Spinner from "./Spinner.jsx";
import InsertConfirmModal from "./InsertConfirmModal.jsx";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
function parseParameterAnnotation(ann = "") {
  const defs = {};
  if (!ann.trim()) return defs;
  ann.split(/\r?\n/).reduce((cur, ln) => {
    const nm = ln.match(/^[\s-]*name:\s*(\S+)/);
    if (nm) return nm[1].replace(/^var_/, "");
    const dv = ln.match(/^\s*defaultValue:\s*(.+)$/);
    if (dv && cur) {
      defs[cur] = dv[1].trim().replace(/^['"]|['"]$/g, "");
      return null;
    }
    return cur;
  }, null);
  return defs;
}

function deriveVarParameterDefaults(t) {
  if (!t?.spec?.templates?.length) return {};
  const prim =
    t.spec.templates.find((x) => x.name === t.metadata.name) ||
    t.spec.templates[0];
  if (!prim?.steps) return {};
  const out = {};
  prim.steps.flat().forEach((s) =>
    s.arguments?.parameters?.forEach((p) => {
      if (p.name?.startsWith("var_")) out[p.name.slice(4)] = "";
    })
  );
  return out;
}

/* ------------------------------------------------------------------ */
/*  Collect suggestions from finished runs                            */
/* ------------------------------------------------------------------ */
async function collectSuggestions(templateName) {
  const sugg = {};
  const add  = (k, v) => {
    if (v === undefined || v === null || String(v).trim() === "") return;
    (sugg[k] ??= new Set()).add(String(v));
  };

  if (!templateName) return {};

  let wfs = [];
  try { wfs = await listWorkflows(); } catch { /* network error – ignore */ }

  wfs
    .filter(
      (wf) =>
        wf.spec?.workflowTemplateRef?.name === templateName ||
        wf.metadata?.generateName?.startsWith(`${templateName}-`)
    )
    .forEach((wf) => {
      (wf.spec?.arguments?.parameters || []).forEach((p) => {
        if (p.name === "event-data" && p.value) {
          try {
            Object.entries(JSON.parse(p.value)).forEach(([k, v]) => add(k, v));
          } catch { /* bad JSON */ }
        } else if (p.name?.startsWith("var_")) {
          add(p.name.slice(4), p.value);
        }
      });
      Object.values(wf.status?.nodes || {}).forEach((n) =>
        (n.outputs?.parameters || []).forEach((pp) =>
          add(pp.name.replace(/^var_/, ""), pp.value)
        )
      );
    });

  const flat = {};
  Object.entries(sugg).forEach(([k, set]) => (flat[k] = [...set]));
  return flat;
}

/* ================================================================== */
/*  Main component                                                    */
/* ================================================================== */
export default function WorkflowTrigger({ onError = () => {} }) {
  const runtime = (typeof window !== "undefined" && window.__ENV__) || {};
  const canSubmit = String(runtime.canSubmit ?? "true").toLowerCase() === "true";
  const showRawButton = String(runtime.showRawButton || "").toLowerCase() === "true";
  const showHideTemplateCheckbox = String(runtime.showHideTemplateCheckbox || "").toLowerCase() === "true";
  const [templates,   setTemplates]   = useState([]);
  const [selected,    setSelected]    = useState("");
  const [params,      setParams]      = useState({});
  const [description, setDescription] = useState("");
  const [suggestions, setSuggestions] = useState({});

  const [rawView,   setRawView]   = useState(false);
  const [hideTemp,  setHideTemp]  = useState(true);
  const [submitting,setSubmitting]= useState(false);
  const [confirming,setConfirming]= useState(false);
  const [infoMsg,   setInfoMsg]   = useState("");
  const [addingField, setAddingField] = useState(null);
  const [newFieldValue, setNewFieldValue] = useState("");

  /* load templates once */
  useEffect(() => {
    listTemplates().then(setTemplates).catch((e) => onError(e.message));
  }, [onError]);

  /* rebuild defaults & suggestions on template change */
  useEffect(() => {
    if (!selected) { setParams({}); setDescription(""); setSuggestions({}); return; }

    const tmpl = templates.find((t) => t.metadata.name === selected);
    if (!tmpl) return;

    const defaults = {
      ...deriveVarParameterDefaults(tmpl),
      ...parseParameterAnnotation(
        tmpl.metadata.annotations?.["ui.argoproj.io/parameters"]
      ),
    };

    const map = {};
    (tmpl.spec?.arguments?.parameters || []).forEach((pr) => {
      if (pr.name === "event-data") {
        map[pr.name] = Object.keys(defaults).length
          ? JSON.stringify(defaults, null, 2)
          : pr.value ?? "";
      } else {
        map[pr.name] = pr.value ?? "";
      }
    });
    setParams(map);

    setDescription(
      tmpl.metadata.annotations?.description ||
        tmpl.metadata.annotations?.["ui.argoproj.io/description"] ||
        ""
    );

    collectSuggestions(selected).then((sugg) => {
      setSuggestions(sugg);

      if (map["event-data"]) {
        try {
          const obj = JSON.parse(map["event-data"]);
          let changed = false;
          Object.keys(sugg).forEach((k) => {
            if (!(k in obj)) { obj[k] = ""; changed = true; }
          });
          if (changed)
            setParams((p) => ({
              ...p,
              "event-data": JSON.stringify(obj, null, 2),
            }));
        } catch { /* keep as raw text */ }
      }
    });
  }, [selected, templates]);

  /* helpers for event-data JSON */
  const parsedObj = () => { try { return JSON.parse(params["event-data"] || "{}"); } catch { return {}; } };
  const updateObj = (o) => setParams((pr) => ({ ...pr, "event-data": JSON.stringify(o, null, 2) }));
  const handleFieldChange = (k, v) => { const o = parsedObj(); o[k] = v; updateObj(o); };

  /* submit flow */
  const doSubmit = async () => {
    setConfirming(false); setSubmitting(true);
    try {
      await submitWorkflow({ resourceName: selected, template: selected, parameters: params });
      setInfoMsg("Submitted!"); setTimeout(() => setInfoMsg(""), 3000);
    } catch (e) { onError(e.message); }
    finally     { setSubmitting(false); }
  };

  const visibleTemplates = templates.filter(
    (t) => !(hideTemp && t.metadata.name.startsWith("template-"))
  );

  if (!canSubmit) return null;

  return (
    <>
      <details className="filter-panel insert-panel">
        <summary className="filter-title">Insert</summary>

        <div className="insert-content">
          {/* Template selector as button grid */}
          <div className="insert-section">
            <label className="insert-label">Template</label>
            <div className="template-buttons">
              {visibleTemplates.map((t) => (
                <button
                  key={t.metadata.name}
                  type="button"
                  className={selected === t.metadata.name ? "template-btn active" : "template-btn"}
                  onClick={() => setSelected(t.metadata.name)}
                >
                  {t.metadata.name}
                </button>
              ))}
              {visibleTemplates.length === 0 && (
                <span className="insert-empty">No templates available</span>
              )}
            </div>
          </div>

          {/* Description */}
          {selected && description && (
            <div className="insert-description">{description}</div>
          )}

          {/* Parameters form */}
          {selected && (
            <div className="insert-form">
              {/* Scalar parameters */}
              {Object.keys(params)
                .filter((n) => n !== "event-data")
                .map((name) => (
                  <div key={name} className="insert-field">
                    <label className="insert-label">{name}</label>
                    <input
                      type="text"
                      className="insert-input"
                      value={params[name]}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, [name]: e.target.value }))}
                    />
                  </div>
                ))}

              {/* Event-data block */}
              {params["event-data"] !== undefined && (
                <div className="insert-event-data">
                  {showRawButton && (
                    <button
                      type="button"
                      className="btn-light insert-toggle-raw"
                      onClick={() => setRawView((r) => !r)}
                    >
                      {rawView ? "Form View" : "Raw JSON"}
                    </button>
                  )}

                  {rawView ? (
                    <textarea
                      className="insert-textarea"
                      rows={6}
                      value={params["event-data"]}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, "event-data": e.target.value }))}
                    />
                  ) : (
                    <div className="insert-fields">
                      {Object.entries(parsedObj()).map(([k, v]) => {
                        const opts = suggestions[k] || [];
                        const isAdding = addingField === k;
                        return (
                          <div key={k} className="insert-field">
                            <label className="insert-label">{k}</label>
                            <div className="insert-options">
                              {opts.map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  className={v === val ? "option-btn active" : "option-btn"}
                                  onClick={() => handleFieldChange(k, val)}
                                >
                                  {val}
                                </button>
                              ))}
                              {v && !opts.includes(v) && (
                                <button
                                  type="button"
                                  className="option-btn active"
                                >
                                  {v}
                                </button>
                              )}
                              {isAdding ? (
                                <span className="insert-add-input">
                                  <input
                                    autoFocus
                                    type="text"
                                    className="insert-input-small"
                                    value={newFieldValue}
                                    onChange={(e) => setNewFieldValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && newFieldValue.trim()) {
                                        handleFieldChange(k, newFieldValue.trim());
                                        setAddingField(null);
                                        setNewFieldValue("");
                                      } else if (e.key === "Escape") {
                                        setAddingField(null);
                                        setNewFieldValue("");
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="option-btn"
                                    onClick={() => {
                                      if (newFieldValue.trim()) {
                                        handleFieldChange(k, newFieldValue.trim());
                                      }
                                      setAddingField(null);
                                      setNewFieldValue("");
                                    }}
                                  >
                                    OK
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="option-btn add-btn"
                                  onClick={() => { setAddingField(k); setNewFieldValue(""); }}
                                >
                                  +
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Submit button */}
              <div className="insert-actions">
                <button
                  type="button"
                  className="btn insert-submit"
                  disabled={submitting}
                  onClick={() => setConfirming(true)}
                >
                  {submitting ? <Spinner small /> : "Insert Workflow"}
                </button>
                {infoMsg && <span className="insert-msg">{infoMsg}</span>}
              </div>
            </div>
          )}

          {/* Toggle template-* visibility */}
          {showHideTemplateCheckbox && (
            <label className="insert-checkbox">
              <input
                type="checkbox"
                checked={hideTemp}
                onChange={(e) => setHideTemp(e.target.checked)}
              />
              Hide <code>template-*</code> templates
            </label>
          )}
        </div>
      </details>

      {/* Confirmation modal */}
      {confirming && (
        <InsertConfirmModal
          template={selected}
          onConfirm={doSubmit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
