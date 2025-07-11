# Argo Workflows UI

![{0DBCE6CC-B8F1-487C-B30B-E3185C90DAB5}](https://github.com/user-attachments/assets/59f169c0-d842-425c-9dbe-d03eeb9762f5)
![{84D0AF15-826B-4AB6-B1A5-E2715C3FEE59}](https://github.com/user-attachments/assets/e3bc264e-c289-4e69-9f64-594408cea84f)

A lightweight, single-container web interface for Kubernetes **Argo Workflows**.

## Features
- **Workflow list** – live table of all runs in the selected namespace.  
- **Label filters** – grouped by label *key*, expanded by default; groups can be collapsed via an env var.  
- **Extra label columns** – pick specific labels to show as dedicated columns in the list.  
- **Full-screen log viewer** – real-time, auto-scrolling logs.  
- **Trigger workflows** – choose a template, fill in parameters, hit *Submit*.  
- **Auto-refresh** – list every 10 s, log stream continuously.  
- **Self-contained image** – React + Vite front-end and Express back-end in one container.

---

## Configuration (environment variables)

| Variable                      | Purpose                                                  | Default                                               |
|-------------------------------|----------------------------------------------------------|-------------------------------------------------------|
| **`ARGO_WORKFLOWS_URL`**      | Base URL of the Argo Workflows API server.               | `http://argo-workflows-server:2746`                   |
| **`ARGO_WORKFLOWS_TOKEN`**    | Bearer token; omit to use the pod’s service-account token automatically. | *(auto)* |
| **`ARGO_WORKFLOWS_NAMESPACE`**| Namespace to operate in.                                 | `$POD_NAMESPACE` or `default`                         |
| `DEBUG_LOGS`                  | Verbose server logging.                                  | `false`                                               |
| **Front-end build-time vars (`VITE_*`)** |                                                  |                                                       |
| `VITE_SKIP_LABELS`            | Comma-separated list of **label keys** or exact `key=value` pairs to hide completely. | `events.argoproj.io/action-timestamp` |
| `VITE_COLLAPSED_LABEL_GROUPS` | Comma-separated list of label keys that should start collapsed in the UI. | *(none – everything expanded)* |
| `VITE_LABEL_PREFIX_TRIM`      | Comma-separated list of prefixes to strip from label keys when shown (purely cosmetic). | `events.argoproj.io/` |
| **`VITE_USE_UTC_TIME`**       | Show timestamps in 24-hour **UTC** instead of local browser time. Any truthy value enables UTC. | *(empty → use browser locale)* |


### Template Annotations

You can augment each **WorkflowTemplate** with these annotations:

- **Description** (`ui.argoproj.io/description` *or* `description`):

    ```yaml
    metadata:
      annotations:
        ui.argoproj.io/description: |
          This template performs X, Y and Z. Fill in the parameters below to customise.
    ```

    The contents appear under **Template Description** in the trigger form.

#### Automatic defaults (no annotation needed)

If the primary template (the one whose `.spec.templates[].name` equals the WorkflowTemplate’s own `metadata.name`) contains steps that forward parameters named **`var_*`**, those names are harvested, the `var_` prefix is stripped, and an empty‑string JSON object is pre‑filled into the special **`event-data`** field.  

Example:

```yaml
steps:
  - - name: deploy
      arguments:
        parameters:
          - name: var_name
          - name: var_version
```

→ The trigger form shows:

```json
{
  "name": "",
  "version": ""
}
```


