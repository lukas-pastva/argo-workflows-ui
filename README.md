# Argo Workflows UI

![{0DBCE6CC-B8F1-487C-B30B-E3185C90DAB5}](https://github.com/user-attachments/assets/59f169c0-d842-425c-9dbe-d03eeb9762f5)
![{84D0AF15-826B-4AB6-B1A5-E2715C3FEE59}](https://github.com/user-attachments/assets/e3bc264e-c289-4e69-9f64-594408cea84f)

A lightweight, single-container web interface for Kubernetes **Argo Workflows**.

## Features
- **Workflow list** – live table of all runs in the selected namespace.  
- **Label filters** – grouped by label *key*, expanded by default; groups can be collapsed via an env var.  
- **Extra label columns** – pick specific labels to show as dedicated columns in the list.  
- **Full-screen log viewer** – real-time, auto-scrolling logs. Enter an optional pod name and a start timestamp to stream from the first line at or after that time.
- **Trigger workflows** – choose a template, fill in parameters, hit *Insert*.  
  - 🆕 Submissions support two backends selectable via env:
    - `events` – POST to an Argo Events webhook (default)
    - `k8s` – create the Workflow via the Kubernetes API
  - The **webhook endpoint is derived from the flow name** (`resourceName`, e.g. `event-deploy`).
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
| **`CREATE_MODE`**                | Workflow create backend: `events` or `k8s`.                             | `events`                                                                                |
| **Webhook URL derivation**       | The server derives the webhook URL from `resourceName` (e.g. `event-deploy`). |                                                                                 |
| `ARGO_EVENTS_SCHEME`             | Webhook scheme.                                                         | `http`                                                                                   |
| `ARGO_EVENTS_SVC_SUFFIX`         | Suffix appended to `resourceName` to form the Service name.             | `-eventsource-svc`                                                                       |
| `ARGO_EVENTS_PORT`               | Webhook Service port.                                                   | `12000`                                                                                  |
| `ARGO_EVENTS_PATH`               | Path on the webhook service.                                            | `/`                                                                                      |
| **Kubernetes API (when `CREATE_MODE=k8s`)** |                                                                 |                                                                                          |
| `K8S_API_URL`                    | Kubernetes API base URL.                                                | `https://kubernetes.default.svc`                                                         |
| `K8S_CA_PATH`                    | Path to cluster CA certificate.                                         | `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt`                                   |
| `K8S_INSECURE_SKIP_TLS_VERIFY`   | Skip TLS verification if no CA is available.                            | `false`                                                                                  |


### Role-based access (with oauth2-proxy)

If you place oauth2-proxy in front of this app and forward the user’s group claim, you can enforce read-only vs. read-write:

- `READONLY_GROUPS` – comma-separated or JSON array of group IDs that should be read-only
- `READWRITE_GROUPS` – comma-separated or JSON array of group IDs that should be read-write

Details:
- The server inspects group headers from oauth2-proxy: `X-Auth-Request-Groups` (preferred) or `X-Forwarded-Groups`.
- Requests from users in `READONLY_GROUPS` cannot submit new workflows (POST /api/workflows) or delete workflows (DELETE /api/workflows/:name).
- The UI hides the “Insert” panel and delete actions when in read-only mode.
- If neither env var is set, behavior defaults to read-write to preserve current behavior.

Example (oauth2-proxy snippet):

```
oidc_groups_claim = "groups"
pass_user_headers = true
set_xauthrequest  = true
allowed_groups = [
  "652dc5a6-310a-4a24-bf56-f8cc2693244e",  # readonly
  "28861a26-da66-4a89-ac9c-87d2dfc31192"   # readwrite
]
```

Run the UI container with:

```
READONLY_GROUPS=652dc5a6-310a-4a24-bf56-f8cc2693244e \
READWRITE_GROUPS=28861a26-da66-4a89-ac9c-87d2dfc31192 \
...
```



## Deep links

- Open a specific run’s detail with `?detail=<workflow-name>` (optionally `/<nodeId>`).
- Search by timestamp + parameter and open detail with `?ts=<timestamp>&st=<value>`:
  - Matches the workflow where parameter `st` equals `<value>` and the run was created closest after `<timestamp>`.
  - Timestamp accepts Unix seconds, milliseconds, or an ISO datetime string.
