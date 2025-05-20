import React, { useEffect, useState } from "react";
import { listTemplates, submitWorkflow } from "../api";
import Spinner             from "./Spinner.jsx";
import InsertConfirmModal  from "./InsertConfirmModal.jsx";

/* -------- helpers for default parameter values ---------------- */
function parseParameterAnnotation(ann = "") {
  const out = {};
  if (!ann.trim()) return out;
  ann.split(/\r?\n/).reduce((cur, ln) => {
    const nm = ln.match(/^[\s-]*name:\s*(\S+)/);
    if (nm) return nm[1].replace(/^var_/, "");
    const dv = ln.match(/^\s*defaultValue:\s*(.+)$/);
    if (dv && cur) {
      out[cur] = dv[1].trim().replace(/^['"]|['"]$/g, "");
      return null;
    }
    return cur;
  }, null);
  return out;
}

function deriveVarDefaults(t) {
  if (!t?.spec?.templates?.length) return {};
  const prim =
    t.spec.templates.find((x) => x.name === t.metadata.name) ||
    t.spec.templates[0];
  if (!prim?.steps) return {};
  const obj = {};
  prim.steps.flat().forEach((s) =>
    s.arguments?.parameters?.forEach((p) => {
      if (p.name?.startsWith("var_")) obj[p.name.slice(4)] = "";
    })
  );
  return obj;
}

export default function WorkflowTrigger({ onError = () => {} }) {
  const [templates, setTemplates]     = useState([]);
  const [selected , setSelected]      = useState("");
  const [params   , setParams]        = useState({});
  const [info     , setInfo]          = useState("");
  const [hideTemp , setHideTemp]      = useState(true);
  const [desc     , setDesc]          = useState("");
  const [rawView  , setRawView]       = useState(false);
  const [busy     , setBusy]          = useState(false);
  const [confirm  , setConfirm]       = useState(false);

  /* --- load templates on mount -------------------------------- */
  useEffect(() => {
    listTemplates().then(setTemplates).catch((e) => onError(e.message));
  }, [onError]);

  /* --- build param map on template change --------------------- */
  useEffect(() => {
    if (!selected) {
      setParams({});
      setDesc("");
      return;
    }
    const t = templates.find((x) => x.metadata.name === selected);
    if (!t) return;

    const defaults = {
      ...deriveVarDefaults(t),
      ...parseParameterAnnotation(
        t.metadata.annotations?.["ui.argoproj.io/parameters"]
      ),
    };

    const map = {};
    (t.spec?.arguments?.parameters || []).forEach((pr) => {
      if (pr.name === "event-data") {
        if (Object.keys(defaults).length)
          map[pr.name] = JSON.stringify(defaults, null, 2);
        else if (pr.value) map[pr.name] = pr.value;
      } else {
        map[pr.name] = pr.value ?? "";
      }
    });
    setParams(map);
    setDesc(
      t.metadata.annotations?.description ||
        t.metadata.annotations?.["ui.argoproj.io/description"] ||
        ""
    );
  }, [selected, templates]);

  /* --- helpers for event-data JSON field ---------------------- */
  const parsedObj = () => {
    try { return JSON.parse(params["event-data"] || "{}"); }
    catch { return {}; }
  };
  const updateObj = (obj) =>
    setParams((p) => ({ ...p, "event-data": JSON.stringify(obj, null, 2) }));

  /* --- submit flow -------------------------------------------- */
  async function doSubmit() {
    setConfirm(false);
    setBusy(true);
    try {
      await submitWorkflow({ template: selected, parameters: params });
      setInfo("✔️ Submitted!");
      setTimeout(() => setInfo(""), 3000);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const visible = templates.filter(
    (t) => !(hideTemp && t.metadata.name.startsWith("template-"))
  );

  /* ----------------------------- render ----------------------- */
  return (
    <>
      <details className="mt-2 w-full rounded border border-gray-300
                          bg-white shadow-sm dark:border-zinc-600
                          dark:bg-zinc-800/80">
        <summary className="cursor-pointer px-6 py-3 font-semibold">
          Insert
        </summary>

        {/* panel body */}
        <div className="space-y-6 px-6 py-4">
          {/* template picker */}
          <div className="flex items-center gap-3">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="min-w-[280px] rounded border border-gray-400
                         bg-white px-3 py-2 text-sm shadow-sm
                         dark:border-zinc-500 dark:bg-zinc-900"
            >
              <option value="">-- choose template --</option>
              {visible.map((t) => (
                <option key={t.metadata.name}>{t.metadata.name}</option>
              ))}
            </select>

            {selected && desc && (
              <span className="italic text-gray-600 dark:text-gray-400">
                {desc}
              </span>
            )}
          </div>

          {/* params form */}
          {selected && (
            <div className="space-y-4">
              {Object.keys(params)
                .filter((n) => n !== "event-data")
                .map((name) => (
                  <div key={name} className="flex items-center gap-3">
                    <label className="w-32 shrink-0 font-medium">{name}</label>
                    <input
                      className="flex-1 rounded border border-gray-400
                                 px-3 py-1.5 text-sm shadow-sm
                                 dark:border-zinc-500 dark:bg-zinc-900"
                      value={params[name]}
                      onChange={(e) =>
                        setParams((p) => ({ ...p, [name]: e.target.value }))
                      }
                    />
                  </div>
                ))}

              {/* event-data special field */}
              {params["event-data"] !== undefined && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="font-medium">event-data</label>
                    <button
                      className="rounded border border-gray-400 px-2 py-0.5
                                 text-xs hover:bg-gray-100
                                 dark:border-gray-500 dark:hover:bg-zinc-700/50"
                      onClick={() => setRawView((v) => !v)}
                    >
                      {rawView ? "Form" : "Raw"}
                    </button>
                  </div>

                  {rawView ? (
                    <textarea
                      rows={4}
                      className="w-full rounded border border-gray-400
                                 px-3 py-2 text-sm font-mono shadow-sm
                                 dark:border-zinc-500 dark:bg-zinc-900"
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
                      <div key={k} className="mb-2 flex items-center gap-3">
                        <label className="w-32 shrink-0">{k}</label>
                        <input
                          className="flex-1 rounded border border-gray-400
                                     px-3 py-1.5 text-sm shadow-sm
                                     dark:border-zinc-500 dark:bg-zinc-900"
                          value={v}
                          onChange={(e) => {
                            const obj = parsedObj();
                            obj[k] = e.target.value;
                            updateObj(obj);
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}

              <button
                className="rounded bg-primary px-6 py-2 font-medium text-white
                           hover:bg-primary/90 disabled:opacity-60"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                {busy ? <Spinner small /> : "Insert"}
              </button>
              <span className="ml-3 text-sm text-green-600">{info}</span>
            </div>
          )}

          {/* hide template-* checkbox */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideTemp}
              onChange={(e) => setHideTemp(e.target.checked)}
            />
            Hide <code className="font-mono">template-*</code> templates
          </label>
        </div>
      </details>

      {/* confirmation modal */}
      {confirm && (
        <InsertConfirmModal
          template={selected}
          onConfirm={doSubmit}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  );
}
