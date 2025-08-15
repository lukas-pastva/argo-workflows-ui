# Argo Workflows UI

![{0DBCE6CC-B8F1-487C-B30B-E3185C90DAB5}](https://github.com/user-attachments/assets/59f169c0-d842-425c-9dbe-d03eeb9762f5)
![{84D0AF15-826B-4AB6-B1A5-E2715C3FEE59}](https://github.com/user-attachments/assets/e3bc264e-c289-4e69-9f64-594408cea84f)

A lightweight, single-container web interface for Kubernetes **Argo Workflows**.

## Features
- **Workflow list** – live table of all runs in the selected namespace.  
- **Label filters** – grouped by label *key*, expanded by default; groups can be collapsed via an env var.  
- **Extra label columns** – pick specific labels to show as dedicated columns in the list.  
- **Full-screen log viewer** – real-time, auto-scrolling logs.  
- **Trigger workflows** – choose a template, fill in parameters, hit *Insert*.  
  - 🆕 Submissions now **POST to an Argo Events webhook** (EventSource) instead of the argo-server `/submit` API.
  - 🆕 The **webhook endpoint is derived from the flow name** (`resourceName`, e.g. `event-deploy`).
- **Auto-refresh** – list every 10 s, log stream continuously.  
- **Self-contained image** – React + Vite front-end and Express back-end in one container.

---

## Configuration (environment variables)

| Variable                         | Purpose                                                                 | Default                                                                                  |
|----------------------------------|-------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| **`ARGO_WORKFLOWS_URL`**         | Base URL of the Argo Workflows **API server** (used for list/logs).    | `http://argo-workflows-server:2746`                                                      |
| **`ARGO_WORKFLOWS_TOKEN`**       | Bearer token; omit to auto-use the pod’s SA token.                      | *(auto)*                                                                                |
| **`ARGO_WORKFLOWS_NAMESPACE`**   | Namespace to operate in.                                                | `$POD_NAMESPACE` or `default`                                                            |
| `DEBUG_LOGS`                     | Verbose server logging.                                                 | `false`                                                                                  |
| **Webhook URL derivation**       | The server derives the webhook URL from `resourceName` (e.g. `event-deploy`). |                                                                                 |
| `ARGO_EVENTS_SCHEME`             | Webhook scheme.                                                         | `http`                                                                                   |
| `ARGO_EVENTS_SVC_SUFFIX`         | Suffix appended to `resourceName` to form the Service name.             | `-eventsource-svc`                                                                       |
| `ARGO_EVENTS_PORT`               | Webhook Service port.                                                   | `12000`                                                                                  |
| `ARGO_EVENTS_PATH`               | Path on the webhook service.                                            | `/`                                                                                      |


