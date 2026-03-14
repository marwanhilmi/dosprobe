# AGENTS.md

## Cursor Cloud specific instructions

### Overview

dosprobe is a pnpm monorepo for automated DOS game testing/reverse-engineering. It uses **Vite+** (`vp`) as the unified toolchain for runtime management, package management, dev/build/test, linting, and formatting. Node.js 25 is managed via `vp env` (pinned in `.node-version`). No build step for backend packages — TypeScript runs natively via Node.js. The UI (`packages/ui`) is the only package that needs a build step.

### Key commands

Prefer `vp` commands over raw `pnpm` commands:

- `vp check` — format + lint + type-check in one pass (preferred for validation loops)
- `vp run typecheck` — type-check with `tsgo -b` (native TS compiler preview)
- `vp lint` — lint with oxc (type-aware + type-check enabled in `vite.config.ts`)
- `vp test` — run Vitest (currently no test files in the repo)
- `vp fmt` — format code
- `vp run build:ui` — build the React/Vite UI for production
- `vp build` — only works from `packages/ui` (root has no index.html)
- `vp install` — install dependencies (delegates to pnpm)
- `pnpm exec dosprobe serve --port 3000` — start the REST/WebSocket API server

### Running the server

`pnpm exec dosprobe serve --port 3000` starts the API server. Without an emulator backend (QEMU/DOSBox-X), the server starts in disconnected mode — the UI loads and API endpoints respond, but emulator operations return errors. This is expected and the server is still fully functional for development.

The server serves the pre-built UI from `packages/ui/dist` (run `vp run build:ui` first), or use `--dev` flag for Vite HMR during UI development.

### Emulator backends

QEMU and DOSBox-X are external system dependencies not installed in the cloud environment. All backend-dependent operations (screenshots, memory reads, register dumps, etc.) require a running emulator. The server, CLI, and UI work without them — they just report "no backend running" for emulator operations.

### Gotchas

- The `esbuild` package's build scripts are blocked by pnpm 10's security policy. The platform binary (`@esbuild/linux-x64`) is still installed correctly via the lockfile, so esbuild works. If a fresh `vp install` shows the "Ignored build scripts: esbuild" warning, this is safe to ignore.
- `vp test` exits with code 1 when no test files exist — this is expected Vitest behavior, not a real failure.
- `vp build` from the workspace root fails because only `packages/ui` is a buildable app. Use `vp run build:ui` from the root or `vp build` from `packages/ui`.
- The `pnpm-workspace.yaml` catalog entries and overrides for `vite`/`vitest` redirect third-party peer dependencies to vite-plus packages. Do not remove them.
