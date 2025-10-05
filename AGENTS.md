# Repository Guidelines

## Project Structure & Module Organization
- `src/client/`: React + Vite SPA (`src/client/src`, components in `components/`).
- `src/server/`: Express API and static host (`src/server/src`). Builds serve SPA from `public/`.
- `src/Dockerfile`: Multi-stage build (client → server). CI pushes image via `.github/workflows/build.yaml`.
- `README.md`: Feature overview and environment variables.

## Build, Test, and Development Commands
- Client dev: `cd src/client && npm install && npm run dev` — runs Vite on localhost with HMR.
- Server dev: `cd src/server && npm install && npm start` — starts Express on `:8080`.
- Client preview: `cd src/client && npm run build && npm run preview` — serves production build.
- Docker image: `docker build -f src/Dockerfile -t argo-workflows-ui:local src` then `docker run -p 8080:8080 argo-workflows-ui:local`.

## Coding Style & Naming Conventions
- JavaScript/JSX with ES modules on server (`type: module`); React 18 on client.
- Indentation: 2 spaces; use semicolons; prefer `const`/`let` over `var`.
- Naming: `camelCase` for variables/functions, `PascalCase` for React components (`src/client/src/components/*`).
- Lint: `cd src/client && npm run lint` (ESLint). Keep imports ordered and avoid unused code.

## Testing Guidelines
- No formal test suite yet. Favor small, pure functions and keep API contracts stable.
- Manual checks: run client + server locally; validate workflow list, logs, and webhook submissions.
- If adding tests, prefer Vitest + React Testing Library for client; Supertest for server. Keep tests under `src/**/__tests__/`.

## Commit & Pull Request Guidelines
- Commits: short, imperative subject (<60 chars). Example: `fix: pagination OOM on large lists`.
- Scope tags optional (`feat:`, `fix:`, `chore:`) — keep history readable (see `git log --oneline`).
- PRs: include clear description, linked issues, before/after screenshots for UI, and steps to reproduce/verify. Note any env vars used.

## Security & Configuration Tips
- Configure Argo endpoints via env vars (see README). Avoid committing tokens; use Kubernetes SA token or `ARGO_WORKFLOWS_TOKEN` at runtime.
- `DEBUG_LOGS=true` prints curl hints; do not enable in production.
- Keep memory usage modest; list APIs are paginated via server settings.

