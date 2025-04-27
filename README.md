<!-- README.md -->
# Argo Workflows UI

![{0DBCE6CC-B8F1-487C-B30B-E3185C90DAB5}](https://github.com/user-attachments/assets/59f169c0-d842-425c-9dbe-d03eeb9762f5)
![{84D0AF15-826B-4AB6-B1A5-E2715C3FEE59}](https://github.com/user-attachments/assets/e3bc264e-c289-4e69-9f64-594408cea84f)

A lightweight, single-container web interface for Kubernetes **Argo Workflows**.

## Features
- **Workflow list** – live table of all runs in the selected namespace.  
- **Label filters** – grouped by label *key*, expanded by default; groups can be collapsed via an env var.  
- **Full-screen log viewer** – real-time, auto-scrolling logs.  
- **Trigger workflows** – choose a template, fill in parameters, hit *Submit*.  
- **Auto-refresh** – list every 10 s, log stream continuously.  
- **Self-contained image** – React + Vite front-end and Express back-end in one container.

---

## Configuration (environment variables)

| Variable | Purpose | Default |
|----------|---------|---------|
| **`ARGO_WORKFLOWS_URL`** | Base URL of the Argo Workflows API server. | `http://argo-workflows-server:2746` |
| **`ARGO_WORKFLOWS_TOKEN`** | Bearer token; omit to use the pod’s service-account token automatically. | *(auto)* |
| **`ARGO_WORKFLOWS_NAMESPACE`** | Namespace to operate in. | `$POD_NAMESPACE` or `default` |
| `DEBUG_LOGS` | Verbose server logging. | `false` |
| **Front-end build-time vars (`VITE_*`)** | | |
| `VITE_SKIP_LABELS` | Comma-separated list of **label keys** *or* exact `key=value` pairs to hide completely. | `events.argoproj.io/action-timestamp` |
| `VITE_COLLAPSED_LABEL_GROUPS` | Comma-separated list of label *keys* that should start *collapsed* in the UI. | *(none – everything expanded)* |
| `VITE_LABEL_PREFIX_TRIM` | Comma-separated list of prefixes to strip from label keys when shown (purely cosmetic). | `events.argoproj.io/` |

> **Important:** all `VITE_*` variables are read by Vite at *build time* – set them before running `npm run build` (or bake them into the Docker layer that performs the build).

### Example helm-values
```yaml
env:
  - name: VITE_HEADER_BG
    value: "#0f2733s"
  - name: DEBUG_LOGS
    value: "true"
  - name: POD_NAMESPACE
    value: "argo-workflows"
  - name: VITE_SKIP_LABELS
    value: "events.argoproj.io/action-timestamp,git-commit"
  - name: VITE_COLLAPSED_LABEL_GROUPS
    value: "git-revision"
  - name: VITE_LABEL_PREFIX_TRIM
    value: "events.argoproj.io/,tekton.dev/"
```