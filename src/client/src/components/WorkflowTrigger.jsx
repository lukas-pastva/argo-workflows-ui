import React, { useEffect, useState } from "react";
import { listTemplates, submitWorkflow } from "../api";
import Spinner from "./Spinner.jsx";

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

export default function WorkflowTrigger({ onError = () => {} }) {
  const [templates, setTemplates]     = useState([]);
  const [selected, setSelected]       = useState("");
  const [params, setParams]           = useState({});
  const [infoMsg, setInfoMsg]         = useState("");
  const [hideTemp, setHideTemp]       = useState(true);
  const [description, setDescription] = useState("");
  const [rawView, setRawView]         = useState(false);
  const [submitting, setSubmitting]   = useState(false);

  /* -------- fetch templates ---------------------------------- */
  useEffect(() => {
    listTemplates().then(setTemplates).catch((e) => onError(e.message));
  }, [onError]);

  /* -------- rebuild params on template change ---------------- */
  useEffect(() => {
    if (!selected) {
      setParams({});
      setDescription("");
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
  }, [selected, templates]);

  /* -------- event‑data helpers ------------------------------- */
  const parsedObj = () => {
    try {
      return JSON.parse(params["event-data"] || "{}");
    } catch {
      return {};
    }
  };
  const updateObj = (obj) =>
    setParams((pr) => ({
      ...pr,
      "event-data": JSON.stringify(obj, null, 2),
    }));

  const handleFieldChange = (k, v) => {
    const o = parsedObj();
    o[k] = v;
    updateObj(o);
  };

  const handleSubmit = async () => {
    setSubmitting(true);                      // ⬅️ NEW
    try {
      await submitWorkflow({ template: selected, parameters: params });
      setInfoMsg("✅ Submitted!");
      setTimeout(() => setInfoMsg(""), 3000);
    } catch (e) {
      onError(e.message);
    } finally {
      setSubmitting(false);                   // ⬅️ NEW
    }
  };

  const visible = templates.filter(
    (t) => !(hideTemp && t.metadata.name.startsWith("template-"))
  );

  /* -------- styles ------------------------------------------- */
  const panel = { width: "50%", minWidth: 320, maxWidth: "50vw", marginLeft: 0 };
  const formCard = {
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    padding: "1rem",
    marginBottom: "0.75rem",
  };
  const kvRow = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.5rem",
  };
  const labelStyle = { width: 120, fontWeight: 500 };

  return (
    <details className="filter-panel" style={panel}>
      <summary className="filter-title">Trigger Workflow</summary>

      <div style={{ padding: "0.75rem 1rem" }}>
        {/* picker */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <select
            className="trigger-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">-- choose template --</option>
            {visible.map((t) => (
              <option key={t.metadata.name}>{t.metadata.name}</option>
            ))}
          </select>

          {selected && description && (
            <span style={{ fontStyle: "italic", opacity: 0.7 }}>
              {description}
            </span>
          )}
        </div>

        {/* form */}
        {selected && (
          <div className="trigger-form" style={formCard}>
            {Object.keys(params)
              .filter((n) => n !== "event-data")
              .map((name) => (
                <div key={name} style={kvRow}>
                  <label style={labelStyle}>{name}</label>
                  <input
                    style={{ flex: 1 }}
                    value={params[name]}
                    onChange={(e) =>
                      setParams((p) => ({ ...p, [name]: e.target.value }))
                    }
                  />
                </div>
              ))}

            {params["event-data"] !== undefined && (
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 4,
                  padding: "0.75rem",
                  marginTop: "0.75rem",
                  marginBottom: "0.75rem",
                }}
              >
                <label
                  style={{
                    ...labelStyle,
                    borderBottom: "1px solid #e2e8f0",
                    paddingBottom: 4,
                  }}
                >
                  event-data
                </label>
                <button
                  className="btn-light"
                  style={{
                    float: "right",
                    marginTop: -4,
                    fontSize: "0.8rem",
                    padding: "0.15rem 0.5rem",
                  }}
                  onClick={() => setRawView((r) => !r)}
                >
                  {rawView ? "Form" : "Raw"}
                </button>

                <div style={{ clear: "both", marginTop: rawView ? 6 : 10 }}>
                  {rawView ? (
                    <textarea
                      rows={4}
                      style={{ width: "100%" }}
                      value={params["event-data"]}
                      onChange={(e) =>
                        setParams((p) => ({
                          ...p,
                          "event-data": e.target.value,
                        }))
                      }
                    />
                  ) : (
                    Object.entries(parsedObj()).map(([k, v]) => (
                      <div key={k} style={kvRow}>
                        <label style={labelStyle}>{k}</label>
                        <input
                          style={{ flex: 1 }}
                          value={v}
                          onChange={(e) =>
                            handleFieldChange(k, e.target.value)
                          }
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <button
              className="btn"
              disabled={submitting}                 // ⬅️ NEW
              onClick={handleSubmit}
            >
              {submitting ? <Spinner small /> : "Submit"}  {/* ⬅️ NEW */}
            </button>
            <span style={{ marginLeft: "0.75rem" }}>{infoMsg}</span>
          </div>
        )}

        {/* toggle */}
        <div style={{ fontSize: "0.85rem" }}>
          <label
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
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
  );
}
