# AGENTS.md

## Cursor Cloud specific instructions

### Overview

dosprobe is a pnpm monorepo for automated DOS game testing/reverse-engineering. It requires **Node.js >= 24** (`.node-version` specifies 25.8.1) and **pnpm 10.x**. No build step for backend packages — TypeScript runs natively via Node.js. The UI (`packages/ui`) is the only package that needs a build step (`pnpm build:ui`).

### Key commands

All commands are defined in root `package.json`:

- `pnpm run typecheck` — type-check with `tsgo -b` (native TS compiler preview)
- `pnpm run lint` — lint with `vp lint --type-aware --type-check` (oxc-based)
- `pnpm run test` — run Vitest (currently no test files in the repo)
- `pnpm run fmt` — format with `vp fmt --write`
- `pnpm run build:ui` — build the React/Vite UI for production
- `pnpm exec dosprobe serve --port 3000` — start the REST/WebSocket API server

**Important**: Use `pnpm run <script>` (not `pnpm <script>`) to run root workspace scripts; bare `pnpm typecheck` may fail with "command not found" due to pnpm's recursive resolution behavior.

### Running the server

`pnpm exec dosprobe serve --port 3000` starts the API server. Without an emulator backend (QEMU/DOSBox-X), the server starts in disconnected mode — the UI loads and API endpoints respond, but emulator operations return errors. This is expected and the server is still fully functional for development.

The server serves the pre-built UI from `packages/ui/dist` (run `pnpm run build:ui` first), or use `--dev` flag for Vite HMR during UI development.

### Emulator backends

QEMU and DOSBox-X are external system dependencies not installed in the cloud environment. All backend-dependent operations (screenshots, memory reads, register dumps, etc.) require a running emulator. The server, CLI, and UI work without them — they just report "no backend running" for emulator operations.

### Gotchas

- The `esbuild` package's build scripts are blocked by pnpm 10's security policy. The platform binary (`@esbuild/linux-x64`) is still installed correctly via the lockfile, so esbuild works. If a fresh `pnpm install` shows the "Ignored build scripts: esbuild" warning, this is safe to ignore.
- `pnpm run test` exits with code 1 when no test files exist — this is expected Vitest behavior, not a real failure.
