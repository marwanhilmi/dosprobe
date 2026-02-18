# DOSBox-X Game Test Harness

Alternative reverse engineering and automated testing infrastructure using
[DOSBox-X](https://github.com/joncampbell123/dosbox-x) instead of QEMU.

## Why DOSBox-X?

| Feature | QEMU + FreeDOS | DOSBox-X |
|---------|---------------|----------|
| Debugger | External GDB stub | Built-in (breakpoints, disasm, memory view) |
| DOS compatibility | FreeDOS (good) | Cycle-accurate (excellent) |
| File sharing | ISO images | Direct host directory mount |
| Snapshots | qcow2 internal | 100 save state slots |
| Key injection | QMP send-key | AUTOTYPE with timing |
| Memory access | GDB RSP protocol | Debugger MEMDUMPBIN command |
| Sound | SB16 emulation | SB16 + OPL + GUS + MT-32 |
| Setup complexity | FreeDOS download + disk image | Single `brew install` |
| Live control | QMP + GDB sockets | Debugger (interactive) |
| Batch automation | Full (socket-based) | Session-based (config-driven) |

**Best for**: Initial RE work, interactive debugging, understanding game logic.
Use the QEMU setup for fully automated CI pipelines.

## Quick Start

```bash
# 1. Setup (installs DOSBox-X, creates configs)
./setup.sh

# 2. Place game files in drive_c/GAME/
cp -r /path/to/game/files/* drive_c/GAME/

# 3. Interactive RE session
./run_interactive.sh

# 4. Or with a game CD-ROM ISO:
./run_interactive.sh ../game-disk1.iso

# 5. Launch directly into a game
./run_game.sh GAME.EXE
./run_game.sh GAME.EXE ../game-disk1.iso

# 6. Debug mode (debugger starts immediately)
./run_debug.sh
```

## Directory Structure

```
dosbox-x/
├── setup.sh                 # This setup script
├── run_interactive.sh       # Launch with display for RE work
├── run_debug.sh             # Launch with debugger active
├── run_game.sh              # Launch and run a game directly
├── harness.py               # Python test harness
├── example_test.py          # Example golden-file workflow
├── conf/
│   ├── dosbox-x.conf        # Interactive config
│   ├── dosbox-x-debug.conf  # Debug config
│   └── dosbox-x-capture.conf # Automated capture config
├── drive_c/                 # Mounted as C: drive
│   ├── GAME/                # Place game files here
│   └── CAPTURE/             # In-DOS capture output
├── captures/                # Host-side captured data
├── states/                  # Save state files (.dsx)
├── golden/                  # Golden reference files
├── game/                    # Game source files/ISOs
└── tools/                   # DOS tools and utilities
```

## DOSBox-X Debugger Quick Reference

Open the debugger with **Alt+Pause** (or launch with `./run_debug.sh`).

### Breakpoints

| Command | Description |
|---------|-------------|
| `BP seg:off` | Execution breakpoint |
| `BPM seg:off` | Memory write breakpoint |
| `BPINT nn` | Break on interrupt nn |
| `BPINT nn ah` | Break on INT nn with AH=ah |
| `BPLIST` | List all breakpoints |
| `BPDEL n` | Delete breakpoint n |

### Execution Control

| Command | Description |
|---------|-------------|
| `C` | Continue execution |
| `T [n]` | Trace (step) n instructions |
| `RUN` | Run until breakpoint |
| `LOG n` | Log next n instructions to file |

### Memory & Registers

| Command | Description |
|---------|-------------|
| `SR` | Show all registers |
| `D seg:off [len]` | Hex dump memory |
| `MEMDUMP seg:off len` | Dump memory (hex) to log |
| `MEMDUMPBIN seg:off len file` | Dump memory (binary) to file |
| `SM seg:off val` | Set memory byte |
| `EAX=12345678` | Set register value |

### Useful Interrupt Breakpoints

```
BPINT 10        # All video BIOS calls
BPINT 10 00     # Set video mode
BPINT 10 13     # Write string
BPINT 21 4C     # Program exit (DOS)
BPINT 21 3D     # Open file
BPINT 21 3F     # Read file
BPINT 33        # Mouse driver
```

## Python Harness Usage

```bash
# Dump VGA framebuffer (Mode 13h)
python3 harness.py dump-memory A000:0000 64000 -o framebuffer.bin --game GAME.EXE

# Same thing with linear address
python3 harness.py dump-memory 0xA0000 64000 -o framebuffer.bin --game GAME.EXE

# Full capture with key injection
python3 harness.py capture --game GAME.EXE --keys "right right up enter" --wait 3.0

# Capture at a specific breakpoint
python3 harness.py capture --game GAME.EXE --breakpoint CS:1234 --prefix level1

# Inject keystrokes
python3 harness.py inject-keys "right right right up enter" --game GAME.EXE

# Read registers
python3 harness.py registers --game GAME.EXE --breakpoint CS:1234

# Generate a debugger command script
python3 harness.py debugger-script --bp CS:1234 --dump A000:0000,64000,fb.bin

# List save states
python3 harness.py state list
```

## Key Addresses (Mode 13h)

| Address | DOSBox-X Format | Description |
|---------|----------------|-------------|
| `0xA0000` | `A000:0000` | VGA framebuffer (64000 bytes, 320x200) |
| `0xB8000` | `B800:0000` | Text mode video memory |
| `0x00400` | `0040:0000` | BIOS Data Area |
| `0x00000` | `0000:0000` | Interrupt Vector Table |

## Save States

DOSBox-X supports 100 save state slots. Create them during interactive sessions:

1. Launch: `./run_interactive.sh`
2. Start your game, reach an interesting state
3. Save state: use the DOSBox-X menu (Machine > Save state)
4. State files are saved to `states/` directory

To use states with the harness, copy `.dsx` files to the `states/` directory
with meaningful names.

## AUTOTYPE Key Names

For the `--keys` argument in the harness:

```
up down left right           # Arrow keys
enter space escape tab       # Common keys
a b c ... z                  # Letters
1 2 3 ... 0                  # Numbers
f1 f2 ... f12                # Function keys
lshift rshift lctrl rctrl    # Modifiers
lalt ralt                    # Alt keys
home end pageup pagedown     # Navigation
insert delete backspace      # Editing
```

## Workflow: Interactive RE

```bash
# 1. Start with debugger
./run_debug.sh ../game-disk1.iso

# 2. In debugger, set breakpoints:
#    BP CS:0100       (program entry)
#    BPINT 10 00      (video mode change)
#    C                (continue)

# 3. When breakpoint hits:
#    SR               (check registers)
#    D DS:0000 100    (examine data segment)
#    T 50             (trace 50 instructions)

# 4. Find interesting addresses, then capture:
#    MEMDUMPBIN A000:0000 FA00 captures/framebuffer.bin

# 5. Save state for later automation
#    (use DOSBox-X menu: Machine > Save state)
```

## Tips

- DOSBox-X addresses are always **segment:offset** (not linear like QEMU/GDB)
- Use `seg_offset_to_linear(seg, off)` in Python to convert
- The built-in debugger is the primary advantage over QEMU for RE work
- For CI automation, the QEMU setup may be more suitable (socket-based control)
- Sound Blaster is at IO 0x220, IRQ 5, DMA 1/5 (matching QEMU setup)
- `AUTOTYPE` timing may need adjustment per game (loading time varies)
- Cycle count (`cycles=max`) runs at max speed; use `cycles=3000` for accurate timing
