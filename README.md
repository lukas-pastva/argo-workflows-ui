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
| **`ARGO_WORKFLOWS_TOKEN`**       | Bearer token; omit to auto-use the pod's SA token.                      | *(auto)*                                                                                |
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
| **UI customization** |  |  |
| `VITE_SHOW_RAW_BUTTON`           | Show the Raw/Form toggle button in the Insert panel.                    | `false`                                                                                  |
| `VITE_SHOW_HIDE_TEMPLATE_CHECKBOX` | Show the "Hide template-* templates" checkbox in the Insert panel.    | `false`                                                                                  |


### Role-based access (with oauth2-proxy)

If you place oauth2-proxy in front of this app and forward the user’s group claim, you can enforce read-only vs. read-write:

- `READONLY_GROUPS` – comma-separated or JSON array of group IDs that should be read-only
- `READWRITE_GROUPS` – comma-separated or JSON array of group IDs that should be read-write
- `READONLY_NAME_FILTERS` – optional per-group substring filters for readonly users; matches workflow name or any top-level parameter value (spec.arguments.parameters[].value).
  - Accepts a JSON object mapping group → filter(s). Values may be a string or an array of strings.
  - Non-JSON shortcut syntax is also supported: `groupA=foo,groupB:bar|baz`.
  - When a readonly user matches one or more groups in this map, only workflows whose name OR any top-level parameter value contains at least one of the configured substrings are listed and accessible (detail/logs). If none of the user’s groups are in the map, the user retains normal readonly visibility.

- `READONLY_MAPPING_FILE` – optional path to a *security groups mapping* file (YAML or JSON) that derives readonly visibility dynamically instead of maintaining `READONLY_NAME_FILTERS` by hand. The file is re-read every `READONLY_MAPPING_REFRESH_SECONDS` (default `30`) and on filesystem events, so a ConfigMap update is picked up without a restart. An invalid file is logged and ignored; the last good mapping stays active.
  - Expected shape (the format of `mapping-security-groups.yaml`):

    ```yaml
    defaultROMappingSecurityGroups: [ "<group-id>" ]   # cluster-wide groups, never narrowed
    defaultRWMappingSecurityGroups: [ "<group-id>" ]
    mappingSecurityGroups:
      - namespacePrefix: team-a-dev
        groupsRO: [ "<group-id>" ]
        groupsRW: [ "<group-id>" ]
    ```

  - Every group listed under an entry may see workflows of that namespace prefix: the workflow label named by `READONLY_MAPPING_LABEL` (default `application`) starts with the prefix, or the workflow name contains it. Groups from the `default*` lists and from `READONLY_GROUPS` / `READWRITE_GROUPS` are never narrowed.
  - Prefixes from the mapping are unioned with any static `READONLY_NAME_FILTERS` for the same user.
- `GET /api/me` returns the caller's groups, role and effective filters (handy to verify the mapping in a cluster).

Details:
- The server inspects group headers from oauth2-proxy via nginx auth_request: `X-Auth-Request-Groups`.
- Requests from users in `READONLY_GROUPS` cannot submit new workflows (POST /api/workflows) or delete workflows (DELETE /api/workflows/:name).
- The UI hides the “Insert” panel and delete actions when in read-only mode.
- If neither env var is set, behavior defaults to read-write to preserve current behavior.

Example (oauth2-proxy snippet):

```
oidc_groups_claim = "groups"
pass_user_headers = true
set_xauthrequest  = true
allowed_groups = [
  "READONLY_GROUP_ID",  # readonly
  "READWRITE_GROUP_ID"   # readwrite
]
```

Run the UI container with:

```
READONLY_GROUPS=READONLY_GROUP_ID \
READWRITE_GROUPS=READWRITE_GROUP_ID \
...
```

Example: restrict readonly group to workflows with names or parameter values containing a prefix

```
READONLY_NAME_FILTERS='{"READONLY_GROUP_ID":"project-x-"}'
```

Example: derive the visibility from a mapping file mounted from a ConfigMap (updated by GitOps, no restart needed)

```
READONLY_MAPPING_FILE=/config/mapping-security-groups.yaml
```

## Deep links

- Open a specific run’s detail with `?detail=<workflow-name>` (optionally `/<nodeId>`).
- Search by timestamp + parameter and open detail with `?ts=<timestamp>&st=<value>`:
  - Matches the workflow where parameter `st` equals `<value>` and the run was created closest after `<timestamp>`.
  - Timestamp accepts Unix seconds, milliseconds, or an ISO datetime string.
