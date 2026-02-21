# dosprobe

Automated testing and reverse-engineering infrastructure for DOS games. Supports two emulator backends (QEMU + FreeDOS and DOSBox-X) with a unified CLI, REST API, and WebSocket API for programmatic control and browser-based debugging.

## Prerequisites

- **Node.js** >= 24 (native TypeScript execution)
- **pnpm** >= 9
- **QEMU** (for QEMU backend) or **DOSBox-X** (for DOSBox-X backend)

## Quick Start

```bash
# Install dependencies
pnpm install

# Type-check
pnpm typecheck

# Run the CLI
pnpm exec dosprobe --help

# Set up an emulator backend
pnpm exec dosprobe setup qemu
pnpm exec dosprobe setup dosbox

# Launch interactive session
pnpm exec dosprobe launch interactive --backend qemu

# Take a screenshot
pnpm exec dosprobe screenshot

# Read memory (VGA framebuffer)
pnpm exec dosprobe memory read 0xA0000 64000

# Send keystrokes
pnpm exec dosprobe keys right right up spc

# Capture game state from a snapshot
pnpm exec dosprobe capture --snapshot level1_start --keys "right up"

# Start the API server
pnpm exec dosprobe serve --port 3000
```

## Monorepo Structure

```
dosprobe/
├── package.json              # Workspace root
├── pnpm-workspace.yaml       # pnpm workspace config
├── tsconfig.json             # Shared TS config (type-checking only)
│
├── packages/
│   ├── core/                 # @dosprobe/core — backend abstraction layer
│   │   └── src/
│   │       ├── types.ts          # Shared types (Registers, DosAddress, etc.)
│   │       ├── address.ts        # seg:off ↔ linear conversion
│   │       ├── backend.ts        # Abstract Backend class
│   │       ├── qemu/             # QEMU backend (QMP + GDB clients)
│   │       ├── dosbox/           # DOSBox-X backend (config/debug/session)
│   │       └── capture/          # Capture pipeline, golden files, framebuffer
│   │
│   ├── cli/                  # @dosprobe/cli — CLI entry point
│   │   └── src/
│   │       ├── index.ts          # Entry point (bin: "dosprobe")
│   │       └── commands/         # 13 yargs command modules
│   │
│   ├── server/               # @dosprobe/server — REST + WebSocket API
│   │   └── src/
│   │       ├── app.ts            # Hono app + middleware
│   │       ├── routes/           # 12 REST route groups
│   │       └── ws/               # WebSocket handlers + channel manager
│   │
│   ├── shared/               # @dosprobe/shared — cross-package utilities
│   │   └── src/
│   │       ├── errors.ts         # Error hierarchy
│   │       ├── binary.ts         # Buffer helpers, hex encode/decode
│   │       └── hash.ts           # SHA256
│   │
│   └── ui/                   # Browser-based debugger UI (React + Vite)
│       └── src/
│           ├── App.tsx           # Root component
│           ├── components/       # UI components
│           ├── contexts/         # React contexts
│           ├── hooks/            # Custom hooks
│           └── lib/              # Client utilities
│
└── data/                     # Runtime data (gitignored)
```

## Backends

### QEMU + FreeDOS

Socket-driven — QMP (JSON-RPC over Unix socket) for VM control and GDB RSP (TCP :1234) for memory/register access. The connection stays open for interactive debugging.

### DOSBox-X

Session-driven — each operation generates a config file and debug script, launches an ephemeral DOSBox-X process, collects output files, and exits. Suited for batch capture workflows.

Both backends implement the same abstract `Backend` interface: `readMemory`, `writeMemory`, `readRegisters`, `sendKeys`, `screenshot`, `setBreakpoint`, `pause`, `resume`, `step`, `saveSnapshot`, `loadSnapshot`, `capture`.

## CLI Commands

| Command | Description |
|---------|-------------|
| `dosprobe setup <qemu\|dosbox>` | Install dependencies, create disk images |
| `dosprobe launch <mode>` | Start emulator (interactive, headless, debug, record, replay, game) |
| `dosprobe screenshot` | Capture screen to file |
| `dosprobe memory read <addr> <size>` | Dump memory region |
| `dosprobe memory write <addr> <data>` | Write memory (base64) |
| `dosprobe keys <keys...>` | Send keystrokes |
| `dosprobe registers` | Read CPU registers |
| `dosprobe capture` | Run capture pipeline (snapshot + keys + wait + optional custom memory ranges) |
| `dosprobe snapshot <save\|load\|list>` | Manage VM snapshots |
| `dosprobe golden <generate\|compare>` | Golden-file testing (framebuffer/screenshot/registers/custom memory) |
| `dosprobe state <list\|info>` | DOSBox-X save states |
| `dosprobe debug-script` | Generate DOSBox-X debugger script |
| `dosprobe iso rebuild` | Rebuild shared files ISO (QEMU) |
| `dosprobe serve` | Start REST + WebSocket API server |
| `dosprobe perf` | Diagnose QEMU performance (accel + RPC microbenchmarks) |

Global options: `--backend qemu|dosbox`, `--project <path>`, `--verbose`, `--json`

## REST API

Start with `dosprobe serve --port 3000`. All endpoints are under `/api`.

### Backend & Lifecycle
- `GET /api/backend` — status and type
- `POST /api/backend/select` — `{ backend: "qemu"|"dosbox" }`
- `POST /api/launch` — start emulator
- `DELETE /api/launch` — shutdown

### Debug & Inspection
- `GET /api/registers` — CPU registers
- `GET /api/memory/:address/:size` — memory dump (raw binary or `?format=base64`)
- `POST /api/memory/:address` — write memory (base64 body)
- `GET /api/screenshot` — screen capture (binary PPM/BMP/PNG)
- `POST /api/keys` — `{ keys: [...], delay: 150 }`
- `GET /api/breakpoints` — list breakpoints
- `POST /api/breakpoints` — create breakpoint
- `DELETE /api/breakpoints/:id` — remove breakpoint
- `POST /api/execution/pause` — pause execution (returns registers)
- `POST /api/execution/resume` — resume execution
- `POST /api/execution/step` — single-step (returns registers)

### Snapshots & Capture
- `GET /api/snapshots` — list snapshots
- `POST /api/snapshots` — save or load snapshot
- `GET /api/states` — DOSBox-X .dsx save states
- `POST /api/captures` — start capture
- `GET /api/captures` — list completed captures
- `POST /api/golden/generate` — generate golden files
- `POST /api/golden/compare` — compare against golden files

## WebSocket API

Connect to `ws://localhost:3000/ws`. Messages are JSON. Binary data (memory dumps, screenshots) is sent as binary frames preceded by a JSON metadata frame.

### Channels

Subscribe with `{ "type": "subscribe", "channel": "<name>" }`.

| Channel | Events | Purpose |
|---------|--------|---------|
| `status` | `status:changed` | UI status indicator |
| `debug` | `debug:breakpoint-hit`, `debug:step-complete` | Debugger panel |
| `memory` | `memory:update` + binary frames | Memory viewer |
| `capture` | `capture:progress`, `capture:complete` | Capture progress |

### Client Messages

```jsonc
{ "type": "exec:pause" }
{ "type": "exec:resume" }
{ "type": "exec:step" }
{ "type": "keys:send", "keys": ["right", "up"] }
{ "type": "memory:watch", "address": "A000:0000", "size": 64000, "intervalMs": 1000, "id": "fb" }
{ "type": "memory:unwatch", "id": "fb" }
{ "type": "memory:read", "address": "0xA0000", "size": 256, "requestId": "r1" }
{ "type": "registers:read", "requestId": "r2" }
{ "type": "screenshot:take", "requestId": "r3" }
```

## Performance Debugging (QEMU)

If gameplay feels sluggish, run:

```bash
# Quick check: host accelerator support + VM connectivity
pnpm exec dosprobe perf --skip-bench

# Full probe: adds register/memory latency and throughput benchmarks
pnpm exec dosprobe perf --iterations 30 --memory-address 0xA0000 --memory-size 64000

# Include screenshot path timing (heavier)
pnpm exec dosprobe perf --include-screenshot --screenshot-iterations 5

# If supported by your QEMU build, test a hardware-accelerated launch profile
pnpm exec dosprobe launch interactive --backend qemu --accel hvf --cpu host --smp 2 --ram 64
```

Key signal: if `Supported accelerators` shows only `tcg`, QEMU is running in software emulation mode, which is substantially slower than hardware acceleration.
When using WebSocket `memory:watch`, keep `intervalMs` at `>= 200` to avoid high-frequency GDB polling overhead.

## Key Addresses (Mode 13h)

| Address | Description |
|---------|-------------|
| `0xA0000` | VGA framebuffer (320x200, 256 colors, 64000 bytes) |
| `0xB8000` | Text mode video memory |
| `0x00400` | BIOS Data Area |
| `0x00000` | Interrupt Vector Table |

## Development

No build step. All `.ts` files run directly via Node.js native TypeScript support. `tsc` is used only for type-checking.

```bash
# Type-check all packages
pnpm typecheck

# Run tests
pnpm test

# Verify native TS execution
node packages/shared/src/hash.ts
```

## Toolchain

| Component | Choice |
|-----------|--------|
| Runtime | Node.js native TypeScript (no build step) |
| Type-checking | `tsc --noEmit` |
| Monorepo | pnpm workspaces |
| CLI | yargs |
| HTTP | Hono |
| WebSocket | ws |
| UI | React + Vite |
| Test | Vitest |
