<!-- README.md -->
# Argo Workflows UI

![{0DBCE6CC-B8F1-487C-B30B-E3185C90DAB5}](https://github.com/user-attachments/assets/59f169c0-d842-425c-9dbe-d03eeb9762f5)

![{84D0AF15-826B-4AB6-B1A5-E2715C3FEE59}](https://github.com/user-attachments/assets/e3bc264e-c289-4e69-9f64-594408cea84f)

A lightweight, single-container web interface for Kubernetes **Argo Workflows**.

## Features
- **Workflow list** – live table of all runs in the selected namespace (name, start time, phase).  
- **Full-screen log viewer** – follows pod logs in real time while a workflow is still running; opens with one click.  
- **Trigger workflows** – automatically loads available workflow templates, builds a parameter form on the fly, and submits new runs.  
- **Auto-refresh** – list refreshes every 10 seconds; log stream keeps scrolling as new lines arrive.  
- **Self-contained image** – React 18 + Vite front-end and Express proxy back-end packaged together; just drop it into the cluster – no external services needed.

Use it when you want a clean, minimal alternative to the full Argo console.

---

## Configuration (environment variables)

| Variable | Purpose | Default |
|----------|---------|---------|
| **`ARGO_WORKFLOWS_URL`** | Base URL of the Argo Workflows API server. | `http://argo-workflows-server:2746` |
| **`ARGO_WORKFLOWS_TOKEN`** | Bearer token for the API. Leave **unset** to make the server automatically read the in-cluster service-account token from `/var/run/secrets/kubernetes.io/serviceaccount/token`. | *(auto-detected)* |
| **`ARGO_WORKFLOWS_NAMESPACE`** | Namespace to operate in. | value of the pod’s `$POD_NAMESPACE` env var, else `default` |
| `DEBUG_LOGS` | Set to `true` for verbose logging. | `false` |
| `VITE_SKIP_LABELS` | Comma-separated list of workflow labels to skip in the UI filter. | `events.argoproj.io/action-timestamp` |

The image therefore runs out-of-the-box in the same namespace as the Argo controller and server – no secrets, no additional config.

### Running with my helm-chartie
```yaml
deployments:

  argo-workflows-ui:
    image: lukaspastva/argo-workflows-ui:latest
    resources:
      limits:
        memory: 400Mi
      requests:
        cpu: 100m
        memory: 100Mi
    serviceAccountExternal: argo-workflows-workflow-controller
    ports:
      - name: http
        port: 8080
        domains:
          - "deploy.example.com"
        paths:
          - "/"
    env:
      - name: DEBUG_LOGS
        value: "true"
      - name: POD_NAMESPACE
        value: "argo-workflows"
      - name: VITE_SKIP_LABELS
        value: "events.argoproj.io/action-timestamp"
```