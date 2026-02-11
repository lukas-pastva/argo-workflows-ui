/* WorkflowTrigger – pick a WorkflowTemplate, fill in parameters, hit "Insert" */

import React, { useEffect, useState } from "react";
import { listTemplates, submitWorkflow, listWorkflows } from "../api";
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
  const prim = t.spec.templates.find((x) => x.name === t.metadata.name) || t.spec.templates[0];
  if (!prim?.steps) return {};
  const out = {};
  prim.steps.flat().forEach((s) =>
    s.arguments?.parameters?.forEach((p) => {
      if (p.name?.startsWith("var_")) out[p.name.slice(4)] = "";
    })
  );
  return out;
}

async function collectSuggestions(templateName) {
  const sugg = {};
  const add = (k, v) => {
    if (v === undefined || v === null || String(v).trim() === "") return;
    (sugg[k] ??= new Set()).add(String(v));
  };
  if (!templateName) return {};
  let wfs = [];
  try { wfs = await listWorkflows(); } catch { }
  wfs
    .filter((wf) => wf.spec?.workflowTemplateRef?.name === templateName || wf.metadata?.generateName?.startsWith(`${templateName}-`))
    .forEach((wf) => {
      (wf.spec?.arguments?.parameters || []).forEach((p) => {
        if (p.name === "event-data" && p.value) {
          try { Object.entries(JSON.parse(p.value)).forEach(([k, v]) => add(k, v)); } catch { }
        } else if (p.name?.startsWith("var_")) {
          add(p.name.slice(4), p.value);
        }
      });
      Object.values(wf.status?.nodes || {}).forEach((n) =>
        (n.outputs?.parameters || []).forEach((pp) => add(pp.name.replace(/^var_/, ""), pp.value))
      );
    });
  const flat = {};
  Object.entries(sugg).forEach(([k, set]) => (flat[k] = [...set]));
  return flat;
}

const MAX_VISIBLE = 10;

/* ================================================================== */
/*  Main component                                                    */
/* ================================================================== */
export default function WorkflowTrigger({ onError = () => {} }) {
  const runtime = (typeof window !== "undefined" && window.__ENV__) || {};
  const canSubmit = String(runtime.canSubmit ?? "true").toLowerCase() === "true";
  const showRawButton = String(runtime.showRawButton || "").toLowerCase() === "true";
  const showHideTemplateCheckbox = String(runtime.showHideTemplateCheckbox || "").toLowerCase() === "true";

  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState("");
  const [params, setParams] = useState({});
  const [description, setDescription] = useState("");
  const [suggestions, setSuggestions] = useState({});
  const [showAll, setShowAll] = useState(false);

  const [rawView, setRawView] = useState(false);
  const [hideTemp, setHideTemp] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [infoMsg, setInfoMsg] = useState("");
  const [addingField, setAddingField] = useState(null);
  const [newFieldValue, setNewFieldValue] = useState("");
  const [expandedFields, setExpandedFields] = useState(new Set());
  const toggleField = (name) => {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  useEffect(() => {
    listTemplates().then(setTemplates).catch((e) => onError(e.message));
  }, [onError]);

  useEffect(() => {
    if (!selected) { setParams({}); setDescription(""); setSuggestions({}); return; }
    const tmpl = templates.find((t) => t.metadata.name === selected);
    if (!tmpl) return;

    const defaults = {
      ...deriveVarParameterDefaults(tmpl),
      ...parseParameterAnnotation(tmpl.metadata.annotations?.["ui.argoproj.io/parameters"]),
    };

    const map = {};
    (tmpl.spec?.arguments?.parameters || []).forEach((pr) => {
      if (pr.name === "event-data") {
        map[pr.name] = Object.keys(defaults).length ? JSON.stringify(defaults, null, 2) : pr.value ?? "";
      } else {
        map[pr.name] = pr.value ?? "";
      }
    });
    setParams(map);
    setDescription(tmpl.metadata.annotations?.description || tmpl.metadata.annotations?.["ui.argoproj.io/description"] || "");

    collectSuggestions(selected).then((sugg) => {
      setSuggestions(sugg);
      if (map["event-data"]) {
        try {
          const obj = JSON.parse(map["event-data"]);
          let changed = false;
          Object.keys(sugg).forEach((k) => { if (!(k in obj)) { obj[k] = ""; changed = true; } });
          if (changed) setParams((p) => ({ ...p, "event-data": JSON.stringify(obj, null, 2) }));
        } catch { }
      }
    });
  }, [selected, templates]);

  const parsedObj = () => { try { return JSON.parse(params["event-data"] || "{}"); } catch { return {}; } };
  const updateObj = (o) => setParams((pr) => ({ ...pr, "event-data": JSON.stringify(o, null, 2) }));
  const handleFieldChange = (k, v) => { const o = parsedObj(); o[k] = v; updateObj(o); };

  const doSubmit = async () => {
    setConfirming(false);
    setSubmitting(true);
    try {
      await submitWorkflow({ resourceName: selected, template: selected, parameters: params });
      setInfoMsg("Submitted!");
      setTimeout(() => setInfoMsg(""), 3000);
    } catch (e) { onError(e.message); }
    finally { setSubmitting(false); }
  };

  const visibleTemplates = templates.filter((t) => !(hideTemp && t.metadata.name.startsWith("template-")));
  const displayedTemplates = showAll ? visibleTemplates : visibleTemplates.slice(0, MAX_VISIBLE);
  const hasMore = visibleTemplates.length > MAX_VISIBLE;

  if (!canSubmit) return null;

  return (
    <>
      <details className="panel insert-panel" open>
        <summary className="panel-title">Insert</summary>
        <div className="panel-body">
          {/* Template buttons */}
          {selected ? (
            <div className="selected-flow-row">
              <button type="button" className="grid-btn active"
                title={selected}>
                <span className="btn-text">{selected}</span>
              </button>
              <button type="button" className="btn-sm deselect-btn"
                onClick={() => { setSelected(""); setExpandedFields(new Set()); }}>
                Change
              </button>
            </div>
          ) : (
            <div className="btn-grid">
              {displayedTemplates.map((t) => (
                <button
                  key={t.metadata.name}
                  type="button"
                  className="grid-btn"
                  onClick={() => { setSelected(t.metadata.name); setExpandedFields(new Set()); }}
                  title={t.metadata.name}
                >
                  <span className="btn-text">{t.metadata.name}</span>
                </button>
              ))}
              {hasMore && !showAll && (
                <button type="button" className="grid-btn more-btn" onClick={() => setShowAll(true)}>
                  +{visibleTemplates.length - MAX_VISIBLE} more
                </button>
              )}
              {hasMore && showAll && (
                <button type="button" className="grid-btn more-btn" onClick={() => setShowAll(false)}>
                  Show less
                </button>
              )}
            </div>
          )}

          {/* Description */}
          {selected && description && <div className="desc">{description}</div>}

          {/* Parameters */}
          {selected && (
            <div className="form-box">
              {/* Regular params (non event-data) */}
              {Object.keys(params).filter((n) => n !== "event-data").map((name) => (
                <div key={name} className="field">
                  <div className="field-header">
                    <label>{name}</label>
                    <button type="button" className="btn-sm field-toggle" onClick={() => toggleField(name)}>
                      {expandedFields.has(name) ? "less" : "more"}
                    </button>
                  </div>
                  {expandedFields.has(name) && (
                    <input type="text" value={params[name]} onChange={(e) => setParams((p) => ({ ...p, [name]: e.target.value }))} />
                  )}
                </div>
              ))}

              {/* Event-data key-value pairs */}
              {params["event-data"] !== undefined && (
                <div className="event-data">
                  {showRawButton && (
                    <button type="button" className="btn-sm" onClick={() => setRawView((r) => !r)}>
                      {rawView ? "Form" : "JSON"}
                    </button>
                  )}
                  {rawView ? (
                    <textarea rows={4} value={params["event-data"]} onChange={(e) => setParams((p) => ({ ...p, "event-data": e.target.value }))} />
                  ) : (
                    <div className="fields">
                      {Object.entries(parsedObj()).map(([k, v]) => {
                        const opts = suggestions[k] || [];
                        const isAdding = addingField === k;
                        const isExpanded = expandedFields.has(`ed:${k}`);
                        return (
                          <div key={k} className="field">
                            <div className="field-header">
                              <label>{k}</label>
                              {v && !isExpanded && <span className="field-value-preview">{v}</span>}
                              <button type="button" className="opt-btn add field-add" onClick={() => { setAddingField(k); setNewFieldValue(""); if (!expandedFields.has(`ed:${k}`)) toggleField(`ed:${k}`); }}>+</button>
                              <button type="button" className="btn-sm field-toggle" onClick={() => toggleField(`ed:${k}`)}>
                                {isExpanded ? "less" : "more"}
                              </button>
                            </div>
                            {isExpanded && (
                              <div className="opts">
                                {opts.map((val) => (
                                  <button key={val} type="button" className={`opt-btn ${v === val ? "active" : ""}`} onClick={() => handleFieldChange(k, val)}>{val}</button>
                                ))}
                                {v && !opts.includes(v) && <button type="button" className="opt-btn active">{v}</button>}
                                {isAdding && (
                                  <span className="add-group">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={newFieldValue}
                                      onChange={(e) => setNewFieldValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && newFieldValue.trim()) { handleFieldChange(k, newFieldValue.trim()); setAddingField(null); setNewFieldValue(""); }
                                        else if (e.key === "Escape") { setAddingField(null); setNewFieldValue(""); }
                                      }}
                                    />
                                    <button type="button" className="opt-btn" onClick={() => { if (newFieldValue.trim()) handleFieldChange(k, newFieldValue.trim()); setAddingField(null); setNewFieldValue(""); }}>OK</button>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="params-toolbar">
                <button type="button" className="btn-sm submit-btn-sm" disabled={submitting} onClick={() => setConfirming(true)}>
                  {submitting ? <Spinner small /> : "Submit"}
                </button>
                {infoMsg && <span className="msg">{infoMsg}</span>}
              </div>
            </div>
          )}

          {showHideTemplateCheckbox && (
            <label className="chk">
              <input type="checkbox" checked={hideTemp} onChange={(e) => setHideTemp(e.target.checked)} />
              Hide template-*
            </label>
          )}
        </div>
      </details>

      {confirming && <InsertConfirmModal template={selected} onConfirm={doSubmit} onCancel={() => setConfirming(false)} />}
    </>
  );
}
