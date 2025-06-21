import React, { useEffect, useState } from "react";
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

/* Harvest names of var_* parameters forwarded by the primary template */
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
/*  🆕  Collect value suggestions from *finished* workflow runs       */
/*      – looks at                                                    */
/*        • spec.arguments.parameters[event-data] JSON                */
/*        • any   var_* parameters in spec / node outputs             */
/* ------------------------------------------------------------------ */
async function collectSuggestions(templateName) {
  const sugg = {};
  const add  = (k, v) => {
    if (v === undefined || v === null || String(v).trim() === "") return;
    if (!sugg[k]) sugg[k] = new Set();
    sugg[k].add(String(v));
  };

  if (!templateName) return {};

  let wfs = [];
  try { wfs = await listWorkflows(); } catch { /* ignore network errors */ }

  wfs
    .filter(
      (wf) =>
        wf.spec?.workflowTemplateRef?.name === templateName ||
        wf.metadata?.generateName?.startsWith(`${templateName}-`)
    )
    .forEach((wf) => {
      /* 1️⃣  event-data JSON */
      (wf.spec?.arguments?.parameters || []).forEach((p) => {
        if (p.name === "event-data" && p.value) {
          try {
            Object.entries(JSON.parse(p.value)).forEach(([k, v]) => add(k, v));
          } catch { /* skip invalid JSON */ }
        } else if (p.name?.startsWith("var_")) {
          add(p.name.slice(4), p.value);
        }
      });

      /* 2️⃣  node-level outputs (covers var_* produced in steps) */
      Object.values(wf.status?.nodes || {}).forEach((n) =>
        (n.outputs?.parameters || []).forEach((pp) => {
          const k = pp.name.replace(/^var_/, "");
          add(k, pp.value);
        })
      );
    });

  /* Set → Array */
  const flat = {};
  Object.entries(sugg).forEach(([k, set]) => (flat[k] = [...set]));
  return flat;
}

/* ================================================================== */
export default function WorkflowTrigger({ onError = () => {} }) {
  const [templates, setTemplates]     = useState([]);
  const [selected, setSelected]       = useState("");
  const [params, setParams]           = useState({});
  const [infoMsg, setInfoMsg]         = useState("");
  const [hideTemp, setHideTemp]       = useState(true);
  const [description, setDescription] = useState("");
  const [rawView, setRawView]         = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [confirming, setConfirming]   = useState(false);
  const [suggestions, setSuggestions] = useState({});

  /* -------- fetch templates once -------------------------------- */
  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch((e) => onError(`Templates: ${e.message}`));
  }, [onError]);

  /* -------- template changed → defaults & suggestions ----------- */
  useEffect(() => {
    if (!selected) {
      setParams({});
      setDescription("");
      setSuggestions({});
      return;
    }

    const tmpl = templates.find((t) => t.metadata.name === selected);
    if (!tmpl) return;

    const defaults = {
      ...deriveVarParameterDefaults(tmpl),
      ...parseParameterAnnotation(
        tmpl.metadata.annotations?.["ui.argoproj.io/parameters"]
      ),
    };

    /* Build initial param-map from template spec */
    const map = {};
    (tmpl.spec?.arguments?.parameters || []).forEach((pr) => {
      if (pr.name === "event-data") {
        if (Object.keys(defaults).length)
          map[pr.name] = JSON.stringify(defaults, null, 2);
        else if (pr.value) map[pr.name] = pr.value;
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

    /* async – load suggestions, then merge *new* keys into the JSON */
    collectSuggestions(selected).then((sugg) => {
      setSuggestions(sugg);

      /* If the event-data object is *empty* but we found suggestions,
         pre-populate the keys so the inputs & dropdowns appear        */
      if (map["event-data"]) {
        try {
          const obj = JSON.parse(map["event-data"]);
          let changed = false;
          Object.keys(sugg).forEach((k) => {
            if (!(k in obj)) {
              obj[k] = "";
              changed = true;
            }
          });
          if (changed)
            setParams((p) => ({
              ...p,
              "event-data": JSON.stringify(obj, null, 2),
            }));
        } catch { /* keep as is */ }
      }
    });
  }, [selected, templates]);

  /* -------- helpers for event-data FORM view -------------------- */
  const parsedObj = () => {
    try { return JSON.parse(params["event-data"] || "{}"); }
    catch { return {}; }
  };
  const updateObj = (o) =>
    setParams((pr) => ({ ...pr, "event-data": JSON.stringify(o, null, 2) }));
  const handleFieldChange = (k, v) => {
    const o = parsedObj();
    o[k] = v;
    updateObj(o);
  };

  /* -------- submission flow ------------------------------------- */
  const doSubmit = async () => {
    setConfirming(false);
    setSubmitting(true);
    try {
      await submitWorkflow({ template: selected, parameters: params });
      setInfoMsg("✅ Submitted!");
      setTimeout(() => setInfoMsg(""), 3000);
    } catch (e) { onError(e.message); }
    finally     { setSubmitting(false); }
  };

  /* -------- presentation bits (unchanged) ----------------------- */
  const panel    = { width: "50%", minWidth: 320, maxWidth: "50vw", marginLeft: 0 };
  const formCard = {
    border: "1px solid #cbd5e1", borderRadius: 6, padding: "1rem", marginBottom: "0.75rem",
  };
  const kvRow      = { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" };
  const labelStyle = { width: 120, fontWeight: 500 };

  const visibleTemplates = templates.filter(
    (t) => !(hideTemp && t.metadata.name.startsWith("template-"))
  );

  return (
    <>
      <details className="filter-panel" style={panel}>
        <summary className="filter-title">Insert</summary>

        <div style={{ padding: "0.75rem 1rem" }}>
          {/* template picker */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem",
                        marginBottom: "0.75rem" }}>
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

          {/* parameters form */}
          {selected && (
            <div className="trigger-form" style={formCard}>
              {/* plain scalar parameters */}
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

              {/* event-data JSON – form or raw */}
              {params["event-data"] !== undefined && (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 4,
                              padding: "0.75rem", margin: "0.75rem 0" }}>
                  <label style={{ ...labelStyle, borderBottom: "1px solid #e2e8f0",
                                  paddingBottom: 4 }}>event-data</label>
                  <button
                    className="btn-light"
                    style={{ float: "right", marginTop: -4, fontSize: "0.8rem",
                             padding: "0.15rem 0.5rem" }}
                    onClick={() => setRawView((r) => !r)}
                  >
                    {rawView ? "Form" : "Raw"}
                  </button>

                  <div style={{ clear: "both", marginTop: rawView ? 6 : 10 }}>
                    {rawView ? (
                      <textarea
                        rows={4} style={{ width: "100%" }}
                        value={params["event-data"]}
                        onChange={(e) =>
                          setParams((p) => ({ ...p, "event-data": e.target.value }))}
                      />
                    ) : (
                      Object.entries(parsedObj()).map(([k, v]) => {
                        const opts = suggestions[k] || [];
                        return (
                          <div key={k} style={kvRow}>
                            <label style={labelStyle}>{k}</label>
                            {opts.length ? (
                              <>
                                <input
                                  list={`sugg-${k}`} style={{ flex: 1 }}
                                  value={v}
                                  onChange={(e) => handleFieldChange(k, e.target.value)}
                                />
                                <datalist id={`sugg-${k}`}>
                                  {opts.map((val) => (
                                    <option key={val} value={val} />
                                  ))}
                                </datalist>
                              </>
                            ) : (
                              <input
                                style={{ flex: 1 }}
                                value={v}
                                onChange={(e) => handleFieldChange(k, e.target.value)}
                              />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              <button className="btn" disabled={submitting}
                      onClick={() => setConfirming(true)}>
                {submitting ? <Spinner small /> : "Insert"}
              </button>
              <span style={{ marginLeft: "0.75rem" }}>{infoMsg}</span>
            </div>
          )}

          {/* toggle template-* visibility */}
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
        </div>
      </details>

      {/* submit confirmation */}
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
