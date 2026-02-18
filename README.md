# DOS Game Test Harness

Automated testing infrastructure for reverse engineering and porting DOS games.
Uses QEMU + FreeDOS 1.4 with GDB and QMP for programmatic control.

## Quick Start

```bash
# 1. Initial setup (installs deps, downloads FreeDOS, creates disk)
./setup.sh

# 2. Boot FreeDOS (pre-installed, shared ISO as D:)
./run_interactive.sh

# 3. Boot with a game CD-ROM (game as D:, shared as E:)
./run_interactive.sh path/to/game-disk1.iso

# 4. Install your game
#    - Put game files in shared/game/
#    - Rebuild the ISO: ./rebuild_shared.sh
#    - Boot the VM, copy from D:\GAME to C:\GAME

# 5. Create a baseline snapshot
#    In QEMU monitor: savevm game_installed

# 6. Run the game, create state snapshots at interesting points
#    In QEMU monitor: savevm level1_start
#    In QEMU monitor: savevm boss_fight

# 7. Use the harness for automated capture
python3 harness.py capture --snapshot level1_start
python3 harness.py screenshot
python3 harness.py registers
python3 harness.py dump-memory 0xA0000 64000 -o framebuffer.bin
python3 harness.py inject-keys "right right up spc"

# 8. Generate golden test files
python3 example_test.py generate
```

## Directory Structure

```
dos-test-harness/
├── setup.sh                 # This setup script
├── run_interactive.sh       # Launch VM with display + debug
├── run_headless.sh          # Launch VM headless (for CI)
├── run_record.sh            # Launch VM in record/replay mode
├── rebuild_shared.sh        # Rebuild shared ISO after changes
├── harness.py               # Python test harness (QMP + GDB)
├── example_test.py          # Example golden-file test workflow
├── vm/
│   ├── dos_hdd.qcow2       # Hard disk (FreeDOS 1.4 pre-installed)
│   ├── shared.iso           # Shared files ISO (mounted as D: or E:)
│   └── qmp.sock             # QMP control socket (runtime)
├── shared/                  # Files to share with the VM
│   ├── game/                # Put your game files here
│   └── tools/               # DOS tools (debuggers, etc.)
├── captures/                # Captured data output
├── golden/                  # Golden reference files for tests
└── snapshots/               # External snapshot metadata
```

## VM Configuration

| Component      | Setting                                    |
|----------------|--------------------------------------------|
| CPU            | QEMU default (i386)                        |
| RAM            | 32 MB                                      |
| Hard disk      | qcow2 (C:) — supports snapshots           |
| CD-ROM         | shared.iso (D:), or game ISO (D:) + shared (E:) |
| Sound          | Sound Blaster 16 — IO 0x220, IRQ 5, DMA 1/5 |
| Audio backend  | CoreAudio (macOS)                          |
| Mouse          | PS/2 with CuteMouse driver (auto-loaded)   |
| Display        | Cocoa (macOS native)                       |
| Debug          | GDB stub on port 1234, QMP unix socket     |

## Key Addresses (Mode 13h)

| Address    | Description                       |
|------------|-----------------------------------|
| `0xA0000`  | VGA framebuffer (64000 bytes)     |
| `0xB8000`  | Text mode video memory            |
| `0x00400`  | BIOS Data Area                    |
| `0x00000`  | Interrupt Vector Table            |

## Tips

- Use DOSBox-X's built-in debugger for initial RE (finding addresses, understanding code)
- Use `seg_offset_to_linear(segment, offset)` to convert DOS addresses for GDB
- QEMU's GDB stub uses linear/physical addresses, not segment:offset
- Record/replay (`run_record.sh`) gives deterministic execution for reproducible captures
- Sound Blaster env var: `SET BLASTER=A220 I5 D1 H5 T6`
- Python harness uses a venv at `.venv/` — run scripts directly (`./harness.py`) or activate it first
