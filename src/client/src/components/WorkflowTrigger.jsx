/* WorkflowTrigger – pick a WorkflowTemplate, fill in parameters,
   hit “Insert”. Dropdown suggestions are harvested from past runs. */

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

/* ------------------------------------------------------------------ */
/*  SuggestInput – always opens its <datalist> picker on click/focus  */
/* ------------------------------------------------------------------ */
function SuggestInput({ listId, value, onChange, style = {} }) {
  const ref = useRef(null);

  const openPicker = () => {
    const el = ref.current;
    if (!el?.showPicker) return;

    const orig = el.value;
    el.value = "";
    el.showPicker();
    setTimeout(() => {
      el.value = orig;
      try { el.setSelectionRange(orig.length, orig.length); } catch {}
    });
  };

  return (
    <input
      ref={ref}
      list={listId}
      value={value}
      onChange={onChange}
      onFocus={openPicker}
      onMouseDown={openPicker}
      style={style}
    />
  );
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
      // 🆕 include resourceName so the server can derive the event endpoint
      await submitWorkflow({ resourceName: selected, template: selected, parameters: params });
      setInfoMsg("✅ Submitted!"); setTimeout(() => setInfoMsg(""), 3000);
    } catch (e) { onError(e.message); }
    finally     { setSubmitting(false); }
  };

  /* styling shorthands */
  const panel = { width: "50%", minWidth: 320, maxWidth: "50vw", marginLeft: 0 };
  const formCard = { border: "1px solid #cbd5e1", borderRadius: 6, padding: "1rem", marginBottom: "0.75rem" };
  const kvRow      = { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" };
  const labelStyle = { width: 120, fontWeight: 500 };

  const visibleTemplates = templates.filter(
    (t) => !(hideTemp && t.metadata.name.startsWith("template-"))
  );

  if (!canSubmit) return null;

  return (
    <>
      <details className="filter-panel" style={panel}>
        <summary className="filter-title">Insert</summary>

        <div style={{ padding: "0.75rem 1rem" }}>
          {/* ── template picker ─────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <select
              className="trigger-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">-- choose template --</option>
              {visibleTemplates.map((t) => (
                <option key={t.metadata.name}>{t.metadata.name}</option>
              ))}
            </select>
            {selected && description && (
              <span style={{ fontStyle: "italic", opacity: 0.7 }}>{description}</span>
            )}
          </div>

          {/* ── parameters form ────────────────────────────────── */}
          {selected && (
            <div className="trigger-form" style={formCard}>
              {/* scalar parameters */}
              {Object.keys(params)
                .filter((n) => n !== "event-data")
                .map((name) => (
                  <div key={name} style={kvRow}>
                    <label style={labelStyle}>{name}</label>
                    <input
                      style={{ flex: 1 }}
                      value={params[name]}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, [name]: e.target.value }))}
                    />
                  </div>
                ))}

              {/* event-data block */}
              {params["event-data"] !== undefined && (
                <div style={{ margin: "0.75rem 0" }}>
                  {showRawButton && (
                    <button
                      className="btn-light"
                      style={{ float: "right", marginTop: -4, fontSize: "0.8rem", padding: "0.15rem 0.5rem" }}
                      onClick={() => setRawView((r) => !r)}
                    >
                      {rawView ? "Form" : "Raw"}
                    </button>
                  )}

                  <div style={{ clear: "both", marginTop: rawView ? 6 : 0 }}>
                    {rawView ? (
                      <textarea
                        rows={4}
                        style={{ width: "100%" }}
                        value={params["event-data"]}
                        onChange={(e) =>
                          setParams((p) => ({ ...p, "event-data": e.target.value }))}
                      />
                    ) : (
                      Object.entries(parsedObj()).map(([k, v]) => {
                        const opts = suggestions[k] || [];
                        const isAdding = addingField === k;
                        return (
                          <div key={k} style={{ ...kvRow, flexWrap: "wrap" }}>
                            <label style={labelStyle}>{k}</label>
                            <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: "0.25rem", alignItems: "center" }}>
                              {opts.map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  className={v === val ? "btn" : "btn-light"}
                                  style={{ fontSize: "0.8rem", padding: "0.2rem 0.5rem" }}
                                  onClick={() => handleFieldChange(k, val)}
                                >
                                  {val}
                                </button>
                              ))}
                              {v && !opts.includes(v) && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ fontSize: "0.8rem", padding: "0.2rem 0.5rem" }}
                                  onClick={() => {}}
                                >
                                  {v}
                                </button>
                              )}
                              {isAdding ? (
                                <span style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
                                  <input
                                    autoFocus
                                    style={{ width: 120, fontSize: "0.8rem", padding: "0.2rem 0.3rem" }}
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
                                    className="btn"
                                    style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem" }}
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
                                  className="btn-light"
                                  style={{ fontSize: "0.8rem", padding: "0.2rem 0.4rem" }}
                                  onClick={() => { setAddingField(k); setNewFieldValue(""); }}
                                >
                                  +
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* submit button */}
              <button className="btn" disabled={submitting} onClick={() => setConfirming(true)}>
                {submitting ? <Spinner small /> : "Insert"}
              </button>
              <span style={{ marginLeft: "0.75rem" }}>{infoMsg}</span>
            </div>
          )}

          {/* toggle template-* visibility */}
          {showHideTemplateCheckbox && (
            <div style={{ fontSize: "0.85rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="checkbox"
                  checked={hideTemp}
                  onChange={(e) => setHideTemp(e.target.checked)}
                />
                Hide <code>template-*</code> templates
              </label>
            </div>
          )}
        </div>
      </details>

      {/* confirmation modal */}
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
