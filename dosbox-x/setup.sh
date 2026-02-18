#!/usr/bin/env bash
#
# dosbox-x/setup.sh
#
# Sets up a DOSBox-X environment on macOS for DOS game
# reverse engineering and automated data capture.
#
# This is an alternative to the QEMU-based setup in the parent
# directory. DOSBox-X provides:
#   - Built-in debugger with breakpoints, memory dump, disassembly
#   - Better DOS hardware compatibility (cycle-accurate)
#   - Direct host directory mounting (no ISO needed)
#   - Built-in save states (100 slots)
#   - AUTOTYPE for automated keystroke injection
#
# Prerequisites: Homebrew installed on macOS
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_DIR="${SCRIPT_DIR}/conf"
DRIVE_C="${SCRIPT_DIR}/drive_c"
CAPTURES_DIR="${SCRIPT_DIR}/captures"
STATES_DIR="${SCRIPT_DIR}/states"
GAME_DIR="${SCRIPT_DIR}/game"
TOOLS_DIR="${SCRIPT_DIR}/tools"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[x]${NC} $*" >&2; }

# --- 1. Install dependencies via Homebrew ---
install_deps() {
    info "Checking and installing dependencies..."

    local deps=(dosbox-x python3)
    local missing=()

    for dep in "${deps[@]}"; do
        if ! brew list "$dep" &>/dev/null; then
            missing+=("$dep")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        info "Installing: ${missing[*]}"
        brew install "${missing[@]}"
    else
        info "All Homebrew dependencies already installed."
    fi

    # Python packages (use a venv to avoid PEP 668 issues)
    local venv_dir="$SCRIPT_DIR/.venv"
    if [[ ! -d "$venv_dir" ]]; then
        info "Creating Python virtual environment..."
        python3 -m venv "$venv_dir"
    fi
    info "Installing Python dependencies..."
    "$venv_dir/bin/pip" install --quiet pillow
}

# --- 2. Create directory structure ---
create_dirs() {
    mkdir -p "$CONF_DIR" "$DRIVE_C" "$CAPTURES_DIR" "$STATES_DIR" \
             "$GAME_DIR" "$TOOLS_DIR" "$DRIVE_C/GAME" "$DRIVE_C/CAPTURE"
    info "Directory structure created."
}

# --- 3. Generate DOSBox-X configuration files ---
generate_configs() {

    # --- Main interactive config ---
    cat > "$CONF_DIR/dosbox-x.conf" << 'CONF'
# DOSBox-X configuration for DOS game reverse engineering
# Interactive mode — display + debugger available (Alt+Pause)

[sdl]
output=opengl
windowresolution=960x720
autolock=false

[dosbox]
title=DOS RE Harness (DOSBox-X)
memsize=16
machine=svga_s3

[cpu]
cputype=auto
cycles=max

[render]
aspect=true
scaler=none

[mixer]
rate=44100

[sblaster]
sbtype=sb16
sbbase=220
irq=5
dma=1
hdma=5

[gus]
gus=false

[midi]
mpu401=intelligent
mididevice=default

[serial]
serial1=disabled
serial2=disabled
serial3=disabled
serial4=disabled

[printer]
printer=false

[log]
# Debugger log output — useful for parsing register dumps
logfile=captures/dosbox-x.log

[debugger]
# debugrunfile can be set to a file of debugger commands
# to execute automatically when the debugger starts

[autoexec]
# Mount the drive_c directory as C:
MOUNT C drive_c
C:

# Show environment info
@ECHO.
@ECHO ========================================
@ECHO  DOS RE Harness (DOSBox-X)
@ECHO ========================================
@ECHO.
@ECHO  C: = Host drive_c directory
@ECHO  Debugger: Alt+Pause
@ECHO  Save State: Host key + F5
@ECHO  Load State: Host key + F6
@ECHO ========================================
@ECHO.
CONF
    info "Generated: conf/dosbox-x.conf"

    # --- Debug config (starts with debugger active) ---
    cat > "$CONF_DIR/dosbox-x-debug.conf" << 'CONF'
# DOSBox-X configuration — debug mode
# Starts with the built-in debugger immediately active.

[sdl]
output=opengl
windowresolution=960x720
autolock=false

[dosbox]
title=DOS RE Harness - DEBUG (DOSBox-X)
memsize=16
machine=svga_s3

[cpu]
cputype=auto
cycles=max

[render]
aspect=true
scaler=none

[sblaster]
sbtype=sb16
sbbase=220
irq=5
dma=1
hdma=5

[log]
logfile=captures/dosbox-x-debug.log

[autoexec]
MOUNT C drive_c
C:
CONF
    info "Generated: conf/dosbox-x-debug.conf"

    # --- Headless / automated capture config ---
    cat > "$CONF_DIR/dosbox-x-capture.conf" << 'CONF'
# DOSBox-X configuration — automated capture mode
# Used by the Python harness for batch operations.
# The harness generates per-session overrides appended to this.

[sdl]
output=opengl
windowresolution=640x400
autolock=false

[dosbox]
title=DOS RE Capture Session
memsize=16
machine=svga_s3

[cpu]
cputype=auto
cycles=max

[sblaster]
sbtype=sb16
sbbase=220
irq=5
dma=1
hdma=5

[log]
logfile=captures/dosbox-x-capture.log

[autoexec]
MOUNT C drive_c
C:
CONF
    info "Generated: conf/dosbox-x-capture.conf"
}

# --- 4. Generate launch scripts ---
generate_launch_scripts() {

    # --- Interactive mode ---
    cat > "$SCRIPT_DIR/run_interactive.sh" << 'LAUNCH'
#!/usr/bin/env bash
# Launch DOSBox-X in interactive mode for RE work.
#
# Usage:
#   ./run_interactive.sh                    # just C: drive
#   ./run_interactive.sh game-disk1.iso     # mount game CD as D:
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GAME_ISO="${1:-}"

ARGS=(-conf "$DIR/conf/dosbox-x.conf")

if [[ -n "$GAME_ISO" ]]; then
    # Resolve to absolute path
    if [[ ! "$GAME_ISO" = /* ]]; then
        GAME_ISO="$(cd "$(dirname "$GAME_ISO")" && pwd)/$(basename "$GAME_ISO")"
    fi
    ARGS+=(-c "IMGMOUNT D \"$GAME_ISO\" -t cdrom")
    echo "  Game ISO mounted as D:"
fi

echo "=== DOSBox-X Interactive Mode ==="
echo "  C: drive = $DIR/drive_c/"
echo ""
echo "  Key bindings:"
echo "    Alt+Pause    — open built-in debugger"
echo "    Ctrl+F5      — screenshot (saved to captures/)"
echo "    Ctrl+F9      — kill DOSBox-X"
echo "    Ctrl+F10     — release mouse"
echo ""
echo "  Debugger commands:"
echo "    BP seg:off             — set breakpoint"
echo "    MEMDUMP seg:off len    — hex dump to log"
echo "    MEMDUMPBIN seg:off len file — binary dump to file"
echo "    SR                     — show registers"
echo "    C                      — continue"
echo "    T [n]                  — trace/step n instructions"
echo "    BPINT nn [ah]          — break on interrupt"
echo "    BPLIST                 — list breakpoints"
echo ""
echo "  Save states (Host key = Ctrl on macOS):"
echo "    Save: Ctrl+Shift+F5 (slot 1-10 via Ctrl+Shift+F1..F10)"
echo "    Load: Ctrl+Shift+F6"
echo ""

cd "$DIR"
exec dosbox-x "${ARGS[@]}"
LAUNCH
    chmod +x "$SCRIPT_DIR/run_interactive.sh"

    # --- Debug mode (debugger starts immediately) ---
    cat > "$SCRIPT_DIR/run_debug.sh" << 'LAUNCH'
#!/usr/bin/env bash
# Launch DOSBox-X with the built-in debugger immediately active.
# Useful for setting breakpoints before the game runs.
#
# Usage:
#   ./run_debug.sh                    # just C: drive
#   ./run_debug.sh game-disk1.iso     # mount game CD as D:
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GAME_ISO="${1:-}"

ARGS=(-conf "$DIR/conf/dosbox-x-debug.conf" -startdebugger)

if [[ -n "$GAME_ISO" ]]; then
    if [[ ! "$GAME_ISO" = /* ]]; then
        GAME_ISO="$(cd "$(dirname "$GAME_ISO")" && pwd)/$(basename "$GAME_ISO")"
    fi
    ARGS+=(-c "IMGMOUNT D \"$GAME_ISO\" -t cdrom")
fi

echo "=== DOSBox-X Debug Mode ==="
echo "  C: drive = $DIR/drive_c/"
echo "  Debugger is immediately active."
echo "  Debug log: $DIR/captures/dosbox-x-debug.log"
echo ""
echo "  Quick reference:"
echo "    BP CS:IP       — set breakpoint at address"
echo "    BPM seg:off    — memory write breakpoint"
echo "    BPINT 21 4C    — break on INT 21h AH=4Ch (exit)"
echo "    BPINT 10       — break on all INT 10h (video)"
echo "    C              — continue execution"
echo "    T 100          — trace 100 instructions"
echo "    LOG 1000       — log next 1000 instructions"
echo "    SR             — show all registers"
echo "    D DS:0000 100  — hex dump 256 bytes at DS:0000"
echo "    MEMDUMPBIN A000:0000 FA00 fb.bin  — dump framebuffer"
echo ""

cd "$DIR"
exec dosbox-x "${ARGS[@]}"
LAUNCH
    chmod +x "$SCRIPT_DIR/run_debug.sh"

    # --- Game launch helper ---
    cat > "$SCRIPT_DIR/run_game.sh" << 'LAUNCH'
#!/usr/bin/env bash
# Launch DOSBox-X and immediately run a game executable.
#
# Usage:
#   ./run_game.sh GAME.EXE                        # run from C:\GAME
#   ./run_game.sh GAME.EXE ../game-disk1.iso      # with game CD as D:
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <GAME.EXE> [game.iso]"
    echo ""
    echo "  Place game files in: $DIR/drive_c/GAME/"
    echo "  Or mount a game ISO as D: by providing the path."
    exit 1
fi

GAME_EXE="$1"
GAME_ISO="${2:-}"

ARGS=(-conf "$DIR/conf/dosbox-x.conf")

if [[ -n "$GAME_ISO" ]]; then
    if [[ ! "$GAME_ISO" = /* ]]; then
        GAME_ISO="$(cd "$(dirname "$GAME_ISO")" && pwd)/$(basename "$GAME_ISO")"
    fi
    ARGS+=(-c "IMGMOUNT D \"$GAME_ISO\" -t cdrom")
fi

ARGS+=(-c "CD \\GAME" -c "$GAME_EXE")

echo "=== DOSBox-X Game Launch ==="
echo "  Running: $GAME_EXE"
[[ -n "$GAME_ISO" ]] && echo "  Game CD: $GAME_ISO"
echo ""

cd "$DIR"
exec dosbox-x "${ARGS[@]}"
LAUNCH
    chmod +x "$SCRIPT_DIR/run_game.sh"

    info "Launch scripts generated."
}

# --- 5. Generate the Python test harness ---
generate_test_harness() {
    echo "#!${SCRIPT_DIR}/.venv/bin/python3" > "$SCRIPT_DIR/harness.py"
    cat >> "$SCRIPT_DIR/harness.py" << 'PYTHON'
"""
DOSBox-X Game Test Harness

Drives DOSBox-X for automated data capture from DOS games.
Uses DOSBox-X's built-in debugger for memory inspection, AUTOTYPE
for keystroke injection, and save states for snapshot management.

Unlike the QEMU harness (which uses QMP + GDB for live socket control),
this harness uses a session-based model: each operation launches a
dedicated DOSBox-X instance with a generated configuration.

Usage:
    # Interactive: use run_interactive.sh or run_debug.sh
    # Automated capture:
    python3 harness.py screenshot
    python3 harness.py dump-memory A000:0000 64000 -o framebuffer.bin
    python3 harness.py dump-memory 0xA0000 64000 -o framebuffer.bin
    python3 harness.py inject-keys "right right right up enter" --game GAME.EXE
    python3 harness.py capture --game GAME.EXE --keys "right right up"
    python3 harness.py registers
    python3 harness.py state list
"""

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
CONF_DIR = SCRIPT_DIR / "conf"
CAPTURES_DIR = SCRIPT_DIR / "captures"
STATES_DIR = SCRIPT_DIR / "states"
DRIVE_C = SCRIPT_DIR / "drive_c"

# Locate DOSBox-X binary
DOSBOX_X = shutil.which("dosbox-x") or "/opt/homebrew/bin/dosbox-x"


# ============================================================
# Address helpers
# ============================================================

def seg_offset_to_linear(segment: int, offset: int) -> int:
    """Convert real-mode segment:offset to linear address."""
    return (segment << 4) + offset


def linear_to_seg_offset(linear: int) -> tuple:
    """Convert linear address to segment:offset for DOSBox-X debugger.
    Returns the canonical form with offset in 0x0000-0x000F range."""
    segment = (linear >> 4) & 0xFFFF
    offset = linear & 0x000F
    return segment, offset


def parse_address(addr_str: str) -> tuple:
    """Parse an address string, accepting both 'seg:off' and '0xLinear' forms.
    Returns (segment, offset)."""
    if ':' in addr_str:
        seg_str, off_str = addr_str.split(':', 1)
        return int(seg_str, 16), int(off_str, 16)
    else:
        linear = int(addr_str, 0)
        return linear_to_seg_offset(linear)


def format_seg_off(segment: int, offset: int) -> str:
    """Format segment:offset for DOSBox-X debugger commands."""
    return f"{segment:04X}:{offset:04X}"


# ============================================================
# DOSBox-X Configuration Generator
# ============================================================

class DOSBoxXConfig:
    """Generate DOSBox-X configuration files with section overrides."""

    def __init__(self, base_conf=None):
        self.sections = {}
        self.autoexec_lines = []
        if base_conf and Path(base_conf).exists():
            self._load(base_conf)
        else:
            self._defaults()

    def _defaults(self):
        self.sections = {
            "sdl": {"output": "opengl", "windowresolution": "640x400", "autolock": "false"},
            "dosbox": {"memsize": "16", "machine": "svga_s3"},
            "cpu": {"cputype": "auto", "cycles": "max"},
            "sblaster": {"sbtype": "sb16", "sbbase": "220", "irq": "5", "dma": "1", "hdma": "5"},
            "log": {"logfile": str(CAPTURES_DIR / "dosbox-x-session.log")},
        }
        self.autoexec_lines = [
            f'MOUNT C "{DRIVE_C}"',
            "C:",
        ]

    def _load(self, path):
        """Load an existing DOSBox-X config file."""
        current_section = None
        in_autoexec = False
        with open(path) as f:
            for line in f:
                line = line.rstrip('\n')
                stripped = line.strip()
                if stripped.startswith('[') and stripped.endswith(']'):
                    current_section = stripped[1:-1].lower()
                    if current_section == "autoexec":
                        in_autoexec = True
                    else:
                        in_autoexec = False
                        if current_section not in self.sections:
                            self.sections[current_section] = {}
                elif in_autoexec:
                    self.autoexec_lines.append(line)
                elif current_section and '=' in stripped and not stripped.startswith('#'):
                    key, _, value = stripped.partition('=')
                    self.sections[current_section][key.strip()] = value.strip()

    def set(self, section, key, value):
        """Set a config option."""
        section = section.lower()
        if section not in self.sections:
            self.sections[section] = {}
        self.sections[section][key] = str(value)

    def set_autoexec(self, lines):
        """Replace autoexec lines entirely."""
        self.autoexec_lines = list(lines)

    def append_autoexec(self, *lines):
        """Append lines to autoexec."""
        self.autoexec_lines.extend(lines)

    def write(self, path):
        """Write configuration to a file."""
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w') as f:
            for section, content in self.sections.items():
                f.write(f"[{section}]\n")
                if isinstance(content, dict):
                    for key, value in content.items():
                        f.write(f"{key}={value}\n")
                f.write("\n")
            # Autoexec always last
            f.write("[autoexec]\n")
            for line in self.autoexec_lines:
                f.write(f"{line}\n")
        return path


# ============================================================
# DOSBox-X Session Manager
# ============================================================

class DOSBoxXSession:
    """Launch and manage a DOSBox-X process."""

    def __init__(self, config_path, working_dir=None):
        self.config_path = str(config_path)
        self.working_dir = working_dir or str(SCRIPT_DIR)
        self.process = None

    def launch(self, extra_args=None, wait=True, timeout=60):
        """Launch DOSBox-X with the given configuration.

        If wait=True, blocks until DOSBox-X exits or timeout.
        Returns (stdout, stderr) if wait=True, else the Popen object.
        """
        cmd = [DOSBOX_X, "-conf", self.config_path]
        if extra_args:
            cmd.extend(extra_args)

        self.process = subprocess.Popen(
            cmd,
            cwd=self.working_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        if wait:
            try:
                stdout, stderr = self.process.communicate(timeout=timeout)
                return stdout, stderr
            except subprocess.TimeoutExpired:
                self.process.kill()
                stdout, stderr = self.process.communicate()
                print(f"[Session] DOSBox-X timed out after {timeout}s, killed.")
                return stdout, stderr
        return self.process

    def kill(self):
        """Kill the DOSBox-X process."""
        if self.process and self.process.poll() is None:
            self.process.kill()
            self.process.wait()


# ============================================================
# DOSBox-X Debugger Script Generator
# ============================================================

class DebugScript:
    """Generate DOSBox-X debugger command scripts."""

    def __init__(self):
        self.commands = []

    def breakpoint(self, segment, offset):
        """Set a breakpoint at segment:offset."""
        self.commands.append(f"BP {segment:04X}:{offset:04X}")
        return self

    def breakpoint_interrupt(self, int_num, ah=None):
        """Break on an interrupt."""
        if ah is not None:
            self.commands.append(f"BPINT {int_num:02X} {ah:02X}")
        else:
            self.commands.append(f"BPINT {int_num:02X}")
        return self

    def memory_breakpoint(self, segment, offset):
        """Set a memory write breakpoint."""
        self.commands.append(f"BPM {segment:04X}:{offset:04X}")
        return self

    def continue_exec(self):
        """Continue execution."""
        self.commands.append("C")
        return self

    def step(self, count=1):
        """Step N instructions."""
        self.commands.append(f"T {count}")
        return self

    def show_registers(self):
        """Dump all CPU registers to the log."""
        self.commands.append("SR")
        return self

    def memdump_hex(self, segment, offset, length):
        """Hex dump to the debug log."""
        self.commands.append(f"MEMDUMP {segment:04X}:{offset:04X} {length:X}")
        return self

    def memdump_bin(self, segment, offset, length, filepath):
        """Binary dump to a file."""
        self.commands.append(f"MEMDUMPBIN {segment:04X}:{offset:04X} {length:X} {filepath}")
        return self

    def log_instructions(self, count):
        """Log N executed instructions."""
        self.commands.append(f"LOG {count}")
        return self

    def raw(self, command):
        """Add a raw debugger command."""
        self.commands.append(command)
        return self

    def write(self, path):
        """Write the debug script to a file."""
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w') as f:
            for cmd in self.commands:
                f.write(f"{cmd}\n")
        return path


# ============================================================
# Debug Log Parser
# ============================================================

class DebugLogParser:
    """Parse DOSBox-X debugger log output for register values and data."""

    @staticmethod
    def parse_registers(log_path) -> dict:
        """Parse register values from a DOSBox-X debug log.

        Looks for lines like:
          EAX:00001234 EBX:00005678 ECX:...
          DS:0070 ES:0070 FS:0000 GS:0000 SS:0070 CS:0070
          EIP:00000100
        """
        regs = {}
        if not Path(log_path).exists():
            return regs

        text = Path(log_path).read_text()

        # 32-bit registers
        for reg in ("EAX", "EBX", "ECX", "EDX", "ESI", "EDI", "EBP", "ESP", "EIP", "EFLAGS"):
            match = re.search(rf'{reg}[=:]([0-9A-Fa-f]{{8}})', text)
            if match:
                regs[reg.lower()] = int(match.group(1), 16)

        # 16-bit segment registers
        for reg in ("CS", "DS", "ES", "SS", "FS", "GS"):
            match = re.search(rf'{reg}[=:]([0-9A-Fa-f]{{4}})', text)
            if match:
                regs[reg.lower()] = int(match.group(1), 16)

        return regs

    @staticmethod
    def parse_last_registers(log_path) -> dict:
        """Parse the LAST register dump from the log (most recent state)."""
        regs = {}
        if not Path(log_path).exists():
            return regs

        text = Path(log_path).read_text()
        # Find all register dump blocks and take the last one
        blocks = list(re.finditer(r'EAX[=:][0-9A-Fa-f]{8}.*?(?=EAX[=:]|\Z)', text, re.DOTALL))
        if not blocks:
            return DebugLogParser.parse_registers(log_path)

        last_block = blocks[-1].group(0)

        for reg in ("EAX", "EBX", "ECX", "EDX", "ESI", "EDI", "EBP", "ESP", "EIP", "EFLAGS"):
            match = re.search(rf'{reg}[=:]([0-9A-Fa-f]{{8}})', last_block)
            if match:
                regs[reg.lower()] = int(match.group(1), 16)

        for reg in ("CS", "DS", "ES", "SS", "FS", "GS"):
            match = re.search(rf'{reg}[=:]([0-9A-Fa-f]{{4}})', last_block)
            if match:
                regs[reg.lower()] = int(match.group(1), 16)

        return regs


# ============================================================
# Capture Pipeline
# ============================================================

class GameCapture:
    """High-level capture operations using DOSBox-X sessions."""

    def __init__(self):
        CAPTURES_DIR.mkdir(parents=True, exist_ok=True)

    def capture_framebuffer_mode13h(self, filename="framebuffer.bin",
                                     game_exe=None, game_iso=None,
                                     bp_seg=None, bp_off=None,
                                     autotype_keys=None, autotype_wait=5.0,
                                     timeout=30):
        """
        Capture the VGA Mode 13h framebuffer (A000:0000, 64000 bytes).

        Launches a DOSBox-X session with the debugger that:
        1. Starts the game
        2. Optionally injects keystrokes via AUTOTYPE
        3. Optionally waits for a breakpoint
        4. Dumps the framebuffer to a binary file
        """
        return self.dump_memory(
            0xA000, 0x0000, 64000, filename,
            game_exe=game_exe, game_iso=game_iso,
            bp_seg=bp_seg, bp_off=bp_off,
            autotype_keys=autotype_keys, autotype_wait=autotype_wait,
            timeout=timeout,
        )

    def dump_memory(self, segment, offset, size, filename="memdump.bin",
                    game_exe=None, game_iso=None,
                    bp_seg=None, bp_off=None,
                    autotype_keys=None, autotype_wait=5.0,
                    timeout=30):
        """
        Dump a memory range using DOSBox-X's debugger.

        If bp_seg:bp_off is provided, sets a breakpoint and waits for it.
        Otherwise captures immediately after game starts.
        """
        out_path = str(CAPTURES_DIR / filename)

        # Build debugger script
        dbg = DebugScript()
        if bp_seg is not None and bp_off is not None:
            dbg.breakpoint(bp_seg, bp_off)
        dbg.continue_exec()
        # After breakpoint hit (or immediately if no BP):
        dbg.memdump_bin(segment, offset, size, out_path)
        dbg.show_registers()

        dbg_path = CAPTURES_DIR / "_session_debug.cmd"
        dbg.write(dbg_path)

        # Build config
        log_path = str(CAPTURES_DIR / "_session_capture.log")
        config = DOSBoxXConfig()
        config.set("log", "logfile", log_path)
        config.set("debugger", "debugrunfile", str(dbg_path))

        # Build autoexec
        autoexec = [f'MOUNT C "{DRIVE_C}"', "C:"]
        if game_iso:
            autoexec.append(f'IMGMOUNT D "{game_iso}" -t cdrom')
        if autotype_keys:
            keys_str = " ".join(autotype_keys)
            autoexec.append(f'AUTOTYPE -w {autotype_wait:.1f} -p 0.15 {keys_str}')
        if game_exe:
            autoexec.append("CD \\GAME")
            autoexec.append(game_exe)
        config.set_autoexec(autoexec)

        conf_path = CONF_DIR / "_session_capture.conf"
        config.write(conf_path)

        # Launch
        print(f"[Capture] Launching DOSBox-X session (timeout={timeout}s)...")
        session = DOSBoxXSession(conf_path)
        session.launch(extra_args=["-startdebugger"], timeout=timeout)

        # Read result
        if Path(out_path).exists():
            data = Path(out_path).read_bytes()
            print(f"[Capture] Memory {segment:04X}:{offset:04X}+0x{size:X} saved: {out_path} ({len(data)} bytes)")
            return data
        else:
            print(f"[Capture] Warning: dump file not created. Check {log_path}")
            return None

    def capture_registers(self, game_exe=None, game_iso=None,
                          bp_seg=None, bp_off=None, timeout=30) -> dict:
        """Capture CPU registers at a specific point."""
        dbg = DebugScript()
        if bp_seg is not None and bp_off is not None:
            dbg.breakpoint(bp_seg, bp_off)
        dbg.continue_exec()
        dbg.show_registers()

        dbg_path = CAPTURES_DIR / "_session_debug.cmd"
        dbg.write(dbg_path)

        log_path = str(CAPTURES_DIR / "_session_regs.log")
        config = DOSBoxXConfig()
        config.set("log", "logfile", log_path)
        config.set("debugger", "debugrunfile", str(dbg_path))

        autoexec = [f'MOUNT C "{DRIVE_C}"', "C:"]
        if game_iso:
            autoexec.append(f'IMGMOUNT D "{game_iso}" -t cdrom')
        if game_exe:
            autoexec.append("CD \\GAME")
            autoexec.append(game_exe)
        config.set_autoexec(autoexec)

        conf_path = CONF_DIR / "_session_regs.conf"
        config.write(conf_path)

        print(f"[Registers] Launching DOSBox-X session...")
        session = DOSBoxXSession(conf_path)
        session.launch(extra_args=["-startdebugger"], timeout=timeout)

        regs = DebugLogParser.parse_last_registers(log_path)
        return regs

    def run_capture_sequence(self, game_exe, key_sequence=None,
                             wait_time=2.0, prefix="seq",
                             bp_seg=None, bp_off=None,
                             game_iso=None, timeout=45):
        """
        Full capture sequence: start game, inject keys, capture
        framebuffer + registers. Used for golden-file test generation.
        """
        print(f"[Capture] Running capture sequence: {prefix}")

        out_fb = f"{prefix}_framebuffer.bin"
        out_regs = f"{prefix}_registers.json"
        fb_path = str(CAPTURES_DIR / out_fb)
        log_path = str(CAPTURES_DIR / f"{prefix}_debug.log")

        # Build debugger script
        dbg = DebugScript()
        if bp_seg is not None and bp_off is not None:
            dbg.breakpoint(bp_seg, bp_off)
        dbg.continue_exec()
        # Dump framebuffer
        dbg.memdump_bin(0xA000, 0x0000, 64000, fb_path)
        dbg.show_registers()

        dbg_path = CAPTURES_DIR / f"{prefix}_debug.cmd"
        dbg.write(dbg_path)

        # Build config
        config = DOSBoxXConfig()
        config.set("log", "logfile", log_path)
        config.set("debugger", "debugrunfile", str(dbg_path))

        autoexec = [f'MOUNT C "{DRIVE_C}"', "C:"]
        if game_iso:
            autoexec.append(f'IMGMOUNT D "{game_iso}" -t cdrom')
        if key_sequence:
            keys_str = " ".join(key_sequence)
            autoexec.append(f'AUTOTYPE -w {wait_time:.1f} -p 0.15 {keys_str}')
        autoexec.append("CD \\GAME")
        autoexec.append(game_exe)
        config.set_autoexec(autoexec)

        conf_path = CONF_DIR / f"_{prefix}_session.conf"
        config.write(conf_path)

        # Launch
        session = DOSBoxXSession(conf_path)
        session.launch(extra_args=["-startdebugger"], timeout=timeout)

        # Collect results
        results = {}

        if Path(fb_path).exists():
            fb_data = Path(fb_path).read_bytes()
            results["framebuffer"] = fb_data
            print(f"[Capture] Framebuffer: {fb_path} ({len(fb_data)} bytes)")
        else:
            results["framebuffer"] = None
            print(f"[Capture] Warning: framebuffer not captured")

        regs = DebugLogParser.parse_last_registers(log_path)
        results["registers"] = regs
        reg_path = CAPTURES_DIR / out_regs
        reg_path.write_text(json.dumps(regs, indent=2))
        print(f"[Capture] Registers: {reg_path}")

        return results


# ============================================================
# Save State Manager
# ============================================================

class StateManager:
    """Manage DOSBox-X save state files."""

    def __init__(self, states_dir=None):
        self.states_dir = Path(states_dir or STATES_DIR)
        self.states_dir.mkdir(parents=True, exist_ok=True)

    def list_states(self) -> list:
        """List all named save states."""
        states = []
        for f in sorted(self.states_dir.glob("*.dsx")):
            size = f.stat().st_size
            mtime = time.ctime(f.stat().st_mtime)
            states.append({
                "name": f.stem,
                "file": str(f),
                "size": size,
                "modified": mtime,
            })
        return states

    def state_path(self, name) -> Path:
        """Get the path for a named state."""
        return self.states_dir / f"{name}.dsx"

    def state_exists(self, name) -> bool:
        return self.state_path(name).exists()


# ============================================================
# CLI Commands
# ============================================================

def cmd_screenshot(args):
    """Take a screenshot by launching DOSBox-X briefly."""
    print("Screenshot capture:")
    print("  For interactive sessions: press Ctrl+F5 in DOSBox-X")
    print(f"  Screenshots are saved to: {CAPTURES_DIR}/")
    print("")
    print("  For the built-in capture, DOSBox-X saves BMP files to its")
    print("  capture directory. Use --game to launch a session:")
    if args.game:
        config = DOSBoxXConfig()
        autoexec = [f'MOUNT C "{DRIVE_C}"', "C:", "CD \\GAME"]
        if args.game:
            autoexec.append(args.game)
        config.set_autoexec(autoexec)
        conf = CONF_DIR / "_screenshot.conf"
        config.write(conf)
        session = DOSBoxXSession(conf)
        session.launch(timeout=args.timeout)
    print("Done.")


def cmd_dump_memory(args):
    """Dump guest memory using the debugger."""
    seg, off = parse_address(args.address)
    cap = GameCapture()
    data = cap.dump_memory(
        seg, off, args.size, args.output,
        game_exe=args.game,
        timeout=args.timeout,
    )
    if data:
        print(f"Saved {len(data)} bytes to {CAPTURES_DIR / args.output}")


def cmd_inject_keys(args):
    """Inject keystrokes into a DOSBox-X session via AUTOTYPE."""
    keys = args.keys.split()

    config = DOSBoxXConfig()
    autoexec = [f'MOUNT C "{DRIVE_C}"', "C:"]
    autoexec.append(f'AUTOTYPE -w {args.delay:.1f} -p 0.15 {" ".join(keys)}')
    if args.game:
        autoexec.append("CD \\GAME")
        autoexec.append(args.game)
    config.set_autoexec(autoexec)

    conf = CONF_DIR / "_inject_keys.conf"
    config.write(conf)

    print(f"[Keys] Injecting {len(keys)} keystrokes (wait={args.delay}s)")
    session = DOSBoxXSession(conf)
    session.launch(timeout=args.timeout)
    print(f"Injected {len(keys)} keystrokes: {' '.join(keys)}")


def cmd_capture(args):
    """Full capture sequence: launch game, inject keys, capture data."""
    cap = GameCapture()
    keys = args.keys.split() if args.keys else None
    bp_seg, bp_off = None, None
    if args.breakpoint:
        bp_seg, bp_off = parse_address(args.breakpoint)

    results = cap.run_capture_sequence(
        game_exe=args.game,
        key_sequence=keys,
        wait_time=args.wait,
        prefix=args.prefix or "capture",
        bp_seg=bp_seg,
        bp_off=bp_off,
        game_iso=args.iso,
        timeout=args.timeout,
    )

    if results.get("registers"):
        print("\nRegisters:")
        for name, val in results["registers"].items():
            if name in ("cs", "ds", "es", "ss", "fs", "gs"):
                print(f"  {name:8s} = 0x{val:04X}")
            else:
                print(f"  {name:8s} = 0x{val:08X}")


def cmd_registers(args):
    """Capture CPU registers at a breakpoint."""
    cap = GameCapture()
    bp_seg, bp_off = None, None
    if args.breakpoint:
        bp_seg, bp_off = parse_address(args.breakpoint)

    regs = cap.capture_registers(
        game_exe=args.game,
        bp_seg=bp_seg, bp_off=bp_off,
        timeout=args.timeout,
    )

    if regs:
        for name, val in regs.items():
            if name in ("cs", "ds", "es", "ss", "fs", "gs"):
                print(f"  {name:8s} = 0x{val:04X}")
            else:
                print(f"  {name:8s} = 0x{val:08X}")
    else:
        print("No register data found. Check the debug log in captures/.")


def cmd_state(args):
    """Manage DOSBox-X save states."""
    mgr = StateManager()

    if args.action == "list":
        states = mgr.list_states()
        if states:
            print(f"{'Name':<20} {'Size':>10}  Modified")
            print("-" * 60)
            for s in states:
                size_kb = s['size'] / 1024
                print(f"{s['name']:<20} {size_kb:>8.1f}KB  {s['modified']}")
        else:
            print("No save states found.")
            print(f"  Create them interactively: run_interactive.sh, then use save state hotkey.")
            print(f"  States directory: {STATES_DIR}")
    elif args.action == "info":
        if not args.name:
            print("Usage: harness.py state info <name>")
            return
        path = mgr.state_path(args.name)
        if path.exists():
            print(f"State: {args.name}")
            print(f"  File: {path}")
            print(f"  Size: {path.stat().st_size / 1024:.1f} KB")
            print(f"  Modified: {time.ctime(path.stat().st_mtime)}")
        else:
            print(f"State '{args.name}' not found.")


def cmd_debugger_script(args):
    """Generate a debugger command script."""
    dbg = DebugScript()

    if args.breakpoints:
        for bp in args.breakpoints:
            seg, off = parse_address(bp)
            dbg.breakpoint(seg, off)

    if args.int_breakpoints:
        for ib in args.int_breakpoints:
            parts = ib.split(':')
            int_num = int(parts[0], 16)
            ah = int(parts[1], 16) if len(parts) > 1 else None
            dbg.breakpoint_interrupt(int_num, ah)

    dbg.continue_exec()
    dbg.show_registers()

    if args.dump:
        for d in args.dump:
            parts = d.split(',')
            seg, off = parse_address(parts[0])
            size = int(parts[1], 0)
            fname = parts[2] if len(parts) > 2 else "memdump.bin"
            dbg.memdump_bin(seg, off, size, str(CAPTURES_DIR / fname))

    out = args.output or str(CAPTURES_DIR / "debug_script.cmd")
    dbg.write(out)
    print(f"Debugger script written to: {out}")
    print(f"Usage: In DOSBox-X debugger, or set debugrunfile={out}")


# ============================================================
# Main CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="DOSBox-X Game Test Harness",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Dump VGA framebuffer (Mode 13h)
  %(prog)s dump-memory A000:0000 64000 -o framebuffer.bin --game GAME.EXE

  # Dump using linear address
  %(prog)s dump-memory 0xA0000 64000 -o framebuffer.bin --game GAME.EXE

  # Full capture with key injection
  %(prog)s capture --game GAME.EXE --keys "right right up enter" --wait 3.0

  # Capture at a specific breakpoint
  %(prog)s capture --game GAME.EXE --breakpoint CS:1234 --prefix level1

  # Generate a debugger script
  %(prog)s debugger-script --bp CS:1234 --bp CS:5678 --dump A000:0000,64000,fb.bin

  # List save states
  %(prog)s state list
""")
    sub = parser.add_subparsers(dest="command")

    # screenshot
    p = sub.add_parser("screenshot", help="Screenshot info (use Ctrl+F5 in interactive mode)")
    p.add_argument("--game", help="Game executable to launch")
    p.add_argument("--timeout", type=int, default=30)

    # dump-memory
    p = sub.add_parser("dump-memory", help="Dump guest memory via debugger")
    p.add_argument("address", help="Address as seg:off (A000:0000) or linear (0xA0000)")
    p.add_argument("size", type=lambda x: int(x, 0), help="Size in bytes")
    p.add_argument("-o", "--output", default="memdump.bin")
    p.add_argument("--game", help="Game executable to launch")
    p.add_argument("--timeout", type=int, default=30)

    # inject-keys
    p = sub.add_parser("inject-keys", help="Send keystrokes via AUTOTYPE")
    p.add_argument("keys", help="Space-separated key names (e.g., 'right right up enter')")
    p.add_argument("-d", "--delay", type=float, default=3.0, help="Wait before typing (seconds)")
    p.add_argument("--game", help="Game executable to launch")
    p.add_argument("--timeout", type=int, default=30)

    # capture
    p = sub.add_parser("capture", help="Full capture sequence")
    p.add_argument("--game", required=True, help="Game executable")
    p.add_argument("--iso", help="Game ISO to mount as D:")
    p.add_argument("-k", "--keys", help="Key sequence to inject")
    p.add_argument("-b", "--breakpoint", help="Break at address (seg:off or 0xLinear)")
    p.add_argument("-w", "--wait", type=float, default=3.0, help="Wait before keys (seconds)")
    p.add_argument("-p", "--prefix", default="capture", help="Output filename prefix")
    p.add_argument("--timeout", type=int, default=45)

    # registers
    p = sub.add_parser("registers", help="Dump CPU registers")
    p.add_argument("--game", help="Game executable to launch")
    p.add_argument("-b", "--breakpoint", help="Break at address first")
    p.add_argument("--timeout", type=int, default=30)

    # state
    p = sub.add_parser("state", help="Manage save states")
    p.add_argument("action", choices=["list", "info"])
    p.add_argument("name", nargs="?", help="State name (for info)")

    # debugger-script
    p = sub.add_parser("debugger-script", help="Generate a debugger command script")
    p.add_argument("--bp", dest="breakpoints", action="append", help="Breakpoint (seg:off or 0xLinear)")
    p.add_argument("--bpint", dest="int_breakpoints", action="append", help="INT breakpoint (nn or nn:ah)")
    p.add_argument("--dump", action="append", help="Memory dump: addr,size[,file]")
    p.add_argument("-o", "--output", help="Output script path")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    {
        "screenshot": cmd_screenshot,
        "dump-memory": cmd_dump_memory,
        "inject-keys": cmd_inject_keys,
        "capture": cmd_capture,
        "registers": cmd_registers,
        "state": cmd_state,
        "debugger-script": cmd_debugger_script,
    }[args.command](args)


if __name__ == "__main__":
    main()
PYTHON
    chmod +x "$SCRIPT_DIR/harness.py"
    info "Python test harness generated: harness.py"
}

# --- 6. Generate example test script ---
generate_example_test() {
    echo "#!${SCRIPT_DIR}/.venv/bin/python3" > "$SCRIPT_DIR/example_test.py"
    cat >> "$SCRIPT_DIR/example_test.py" << 'PYTHON'
"""
Example: automated golden-file test generation using DOSBox-X.

This shows the full workflow:
1. Launch DOSBox-X with the game
2. Inject inputs via AUTOTYPE
3. Capture the resulting game state (framebuffer + memory)
4. Compare against golden files from a previous run

Adapt the addresses, game executable, and key sequences to your game.

NOTE: Unlike the QEMU harness which loads snapshots for each test,
DOSBox-X captures are independent sessions. Each test launches a
fresh DOSBox-X instance with the configured key sequence. For
consistent captures, use breakpoints at known game addresses.
"""
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from harness import (
    GameCapture, DOSBoxXConfig, DOSBoxXSession, DebugScript,
    DebugLogParser, seg_offset_to_linear, parse_address,
    CAPTURES_DIR, CONF_DIR, DRIVE_C
)

GOLDEN_DIR = Path(__file__).parent / "golden"


def generate_golden_files():
    """Run once to create the reference data from the original game."""
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    cap = GameCapture()

    # -------------------------------------------------------
    # CUSTOMIZE THESE FOR YOUR GAME
    # -------------------------------------------------------

    GAME_EXE = "GAME.EXE"           # <-- your game executable
    GAME_ISO = None                   # <-- set if game needs CD-ROM

    # Breakpoint at the game's main render routine (find with debugger)
    # Set to None to capture without a specific breakpoint
    RENDER_BP = ("CS", 0x1234)        # <-- (segment_name, offset) or None

    # Game data segment — find DS value in DOSBox-X debugger
    GAME_DS = 0x2A30                  # <-- from your RE work
    GAME_STATE_OFFSET = 0x0100        # <-- offset of interesting game state
    GAME_STATE_SIZE = 256             # <-- how much to capture

    tests = [
        {
            "name": "idle",
            "keys": [],
            "wait": 3.0,
        },
        {
            "name": "move_right",
            "keys": ["right", "right", "right"],
            "wait": 2.0,
        },
        {
            "name": "jump",
            "keys": ["space"],
            "wait": 2.0,
        },
    ]

    for test in tests:
        print(f"\n=== Generating golden: {test['name']} ===")

        # Build debugger script for this test
        dbg = DebugScript()
        # Set breakpoint if configured
        if RENDER_BP:
            dbg.breakpoint(0, RENDER_BP[1])  # CS will be resolved at runtime
        dbg.continue_exec()

        # Dump framebuffer
        fb_path = str(GOLDEN_DIR / f"{test['name']}_fb.bin")
        dbg.memdump_bin(0xA000, 0x0000, 64000, fb_path)

        # Dump game state
        state_path = str(GOLDEN_DIR / f"{test['name']}_state.bin")
        dbg.memdump_bin(GAME_DS, GAME_STATE_OFFSET, GAME_STATE_SIZE, state_path)

        # Show registers
        dbg.show_registers()

        dbg_file = CAPTURES_DIR / f"golden_{test['name']}_debug.cmd"
        dbg.write(dbg_file)

        # Build config
        log_path = str(CAPTURES_DIR / f"golden_{test['name']}.log")
        config = DOSBoxXConfig()
        config.set("log", "logfile", log_path)
        config.set("debugger", "debugrunfile", str(dbg_file))

        autoexec = [f'MOUNT C "{DRIVE_C}"', "C:"]
        if GAME_ISO:
            autoexec.append(f'IMGMOUNT D "{GAME_ISO}" -t cdrom')
        if test["keys"]:
            keys_str = " ".join(test["keys"])
            autoexec.append(f'AUTOTYPE -w {test["wait"]:.1f} -p 0.15 {keys_str}')
        autoexec.append("CD \\GAME")
        autoexec.append(GAME_EXE)
        config.set_autoexec(autoexec)

        conf_path = CONF_DIR / f"_golden_{test['name']}.conf"
        config.write(conf_path)

        # Run session
        session = DOSBoxXSession(conf_path)
        session.launch(extra_args=["-startdebugger"], timeout=30)

        # Verify and compute checksums
        checksums = {}

        if Path(fb_path).exists():
            fb_data = Path(fb_path).read_bytes()
            checksums["framebuffer_sha256"] = hashlib.sha256(fb_data).hexdigest()
            print(f"  FB: {len(fb_data)} bytes, sha256={checksums['framebuffer_sha256'][:16]}...")
        else:
            print(f"  FB: NOT CAPTURED (check debugger log)")

        if Path(state_path).exists():
            state_data = Path(state_path).read_bytes()
            checksums["state_sha256"] = hashlib.sha256(state_data).hexdigest()
            print(f"  State: {len(state_data)} bytes, sha256={checksums['state_sha256'][:16]}...")
        else:
            print(f"  State: NOT CAPTURED (check debugger log)")

        (GOLDEN_DIR / f"{test['name']}_checksums.json").write_text(
            json.dumps(checksums, indent=2))

        # Parse registers
        regs = DebugLogParser.parse_last_registers(log_path)
        if regs:
            (GOLDEN_DIR / f"{test['name']}_registers.json").write_text(
                json.dumps(regs, indent=2))
            print(f"  Registers captured")

    print(f"\nGolden files saved to: {GOLDEN_DIR}")


def compare_port_output(test_name: str, port_fb: bytes, port_state: bytes) -> bool:
    """
    Compare your port's output against the golden files.
    Call this from your port's test suite.
    """
    fb_match = True
    state_match = True

    fb_golden = GOLDEN_DIR / f"{test_name}_fb.bin"
    if fb_golden.exists():
        golden_fb = fb_golden.read_bytes()
        fb_match = (golden_fb == port_fb)
        if not fb_match:
            for i, (a, b) in enumerate(zip(golden_fb, port_fb)):
                if a != b:
                    print(f"  FB mismatch at offset {i}: golden=0x{a:02X} port=0x{b:02X}")
                    break

    state_golden = GOLDEN_DIR / f"{test_name}_state.bin"
    if state_golden.exists():
        golden_state = state_golden.read_bytes()
        state_match = (golden_state == port_state)
        if not state_match:
            for i, (a, b) in enumerate(zip(golden_state, port_state)):
                if a != b:
                    print(f"  State mismatch at offset {i}: golden=0x{a:02X} port=0x{b:02X}")
                    break

    return fb_match and state_match


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "generate":
        generate_golden_files()
    else:
        print("Usage:")
        print("  python3 example_test.py generate   # Create golden files from original game")
        print("")
        print("Then in your port's test suite, call compare_port_output() to validate.")
        print("")
        print("Before running, edit the CUSTOMIZE section in this file to set:")
        print("  - GAME_EXE:           your game's executable name")
        print("  - GAME_ISO:           path to game CD ISO (or None)")
        print("  - RENDER_BP:          breakpoint at render routine")
        print("  - GAME_DS/OFFSET/SIZE: game state memory location")
PYTHON
    chmod +x "$SCRIPT_DIR/example_test.py"
    info "Example test script generated: example_test.py"
}

# --- 7. Generate README ---
generate_readme() {
    cat > "$SCRIPT_DIR/README.md" << 'MD'
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
MD
    info "README generated."
}

# ============================================================
# Main
# ============================================================

main() {
    echo ""
    echo "=========================================="
    echo "  DOS Game Test Harness Setup (DOSBox-X)  "
    echo "  Alternative to QEMU + FreeDOS           "
    echo "=========================================="
    echo ""

    install_deps
    create_dirs
    generate_configs
    generate_launch_scripts
    generate_test_harness
    generate_example_test
    generate_readme

    echo ""
    info "Setup complete!"
    echo ""
    echo "  Next steps:"
    echo "    1. Place game files in: drive_c/GAME/"
    echo "    2. ./run_interactive.sh             — interactive RE session"
    echo "    3. ./run_debug.sh                   — debugger active from start"
    echo "    4. ./run_game.sh GAME.EXE           — launch a game directly"
    echo "    5. python3 harness.py --help         — automated capture"
    echo ""
    echo "  See README.md for full documentation."
    echo ""
}

main "$@"
