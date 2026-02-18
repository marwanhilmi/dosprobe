#!/usr/bin/env bash
#
# dos-test-harness/setup.sh
#
# Sets up a QEMU + FreeDOS environment on macOS for DOS game
# reverse engineering and automated data capture.
#
# Prerequisites: Homebrew installed on macOS
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${SCRIPT_DIR}/vm"
FREEDOS_URL="https://www.ibiblio.org/pub/micro/pc-stuff/freedos/files/distributions/1.4/FD14-FullUSB.zip"
SHARED_DIR="${SCRIPT_DIR}/shared"
SNAPSHOTS_DIR="${SCRIPT_DIR}/snapshots"
CAPTURES_DIR="${SCRIPT_DIR}/captures"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }

# --- 1. Install dependencies via Homebrew ---
install_deps() {
    info "Checking and installing dependencies..."

    local deps=(qemu mtools cdrtools python3 socat)
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

    # Python packages for the test harness (use a venv to avoid PEP 668 issues)
    local venv_dir="$SCRIPT_DIR/.venv"
    if [[ ! -d "$venv_dir" ]]; then
        info "Creating Python virtual environment..."
        python3 -m venv "$venv_dir"
    fi
    info "Installing Python dependencies..."
    "$venv_dir/bin/pip" install --quiet pillow qmp requests
}

# --- 2. Download FreeDOS and create boot disk ---
download_freedos() {
    mkdir -p "$WORK_DIR"
    local disk="$WORK_DIR/dos_hdd.qcow2"

    if [[ -f "$disk" ]]; then
        info "FreeDOS disk image already exists: $disk"
        return
    fi

    info "Downloading FreeDOS 1.4 (FullUSB — pre-installed disk image)..."
    local zip_path="$WORK_DIR/freedos.zip"
    curl -L -o "$zip_path" "$FREEDOS_URL"

    info "Extracting FreeDOS..."
    unzip -o "$zip_path" -d "$WORK_DIR/freedos_extract"

    # The FullUSB zip contains a raw .img disk with FreeDOS pre-installed
    local img_file
    img_file=$(find "$WORK_DIR/freedos_extract" -iname "*.img" | head -n1)

    if [[ -z "$img_file" ]]; then
        warn "No .img found in zip. Listing contents:"
        find "$WORK_DIR/freedos_extract" -type f
        error "Could not find FreeDOS disk image."
        exit 1
    fi

    # The FullUSB image ships with an installer (SETUP.BAT) that runs on
    # every boot via FDAUTO.BAT. Remove it and patch FDAUTO.BAT so FreeDOS
    # boots straight to a command prompt.
    info "Patching startup files (removing installer)..."
    local offset=32256  # partition 1 starts at sector 63 (63*512)
    mdel -i "$img_file"@@$offset ::SETUP.BAT 2>/dev/null || true

    # Rewrite FDAUTO.BAT without the "if exist SETUP.BAT" block
    local tmp_bat
    tmp_bat=$(mktemp)
    mcopy -i "$img_file"@@$offset ::FDAUTO.BAT "$tmp_bat" 2>/dev/null
    # Remove the RunSetup block: from "if not exist SETUP.BAT" through ":Done"
    sed '/^if not exist SETUP.BAT/,/^:Done/{ /^:Done/!d; }' "$tmp_bat" > "${tmp_bat}.fixed"
    mcopy -o -i "$img_file"@@$offset "${tmp_bat}.fixed" ::FDAUTO.BAT
    rm -f "$tmp_bat" "${tmp_bat}.fixed"

    info "Converting to qcow2 (for snapshot support)..."
    qemu-img convert -f raw -O qcow2 "$img_file" "$disk"

    info "FreeDOS disk ready: $disk"
    rm -f "$zip_path"
    rm -rf "$WORK_DIR/freedos_extract"
}

# --- 4. Create a shared data transfer ISO ---
# This is how we get files in/out of the VM easily.
create_shared_iso() {
    mkdir -p "$SHARED_DIR"

    # Drop a readme and any tools you want inside the VM
    cat > "$SHARED_DIR/README.TXT" << 'EOF'
DOS Test Harness - Shared Directory
====================================
Place your game files, tools, and extraction
utilities here. This directory is burned to an
ISO and mounted as D: in the VM.

Rebuild the ISO after changes:
  ./rebuild_shared.sh
EOF

    # Create a helper batch file that sets up the DOS environment
    cat > "$SHARED_DIR/SETUP.BAT" << 'EOF'
@ECHO OFF
ECHO.
ECHO ========================================
ECHO  DOS Test Harness Environment
ECHO ========================================
ECHO.
ECHO  C: = FreeDOS system + game install
ECHO  D: = Shared data (read-only ISO)
ECHO.
ECHO  To capture data, write to C:\CAPTURE
ECHO ========================================
ECHO.
IF NOT EXIST C:\CAPTURE MD C:\CAPTURE
IF NOT EXIST C:\GAME MD C:\GAME
PATH=%PATH%;D:\TOOLS
EOF

    info "Building shared ISO..."
    if command -v mkisofs &>/dev/null; then
        mkisofs -o "$WORK_DIR/shared.iso" \
            -V "SHARED" \
            -r -J \
            "$SHARED_DIR" 2>/dev/null
    elif command -v genisoimage &>/dev/null; then
        genisoimage -o "$WORK_DIR/shared.iso" \
            -V "SHARED" \
            -r -J \
            "$SHARED_DIR" 2>/dev/null
    else
        warn "No ISO tool found (mkisofs/genisoimage). Install cdrtools."
        warn "Skipping shared ISO creation."
        return
    fi
    info "Shared ISO created: $WORK_DIR/shared.iso"
}

# --- 5. Create directory structure ---
create_dirs() {
    mkdir -p "$SNAPSHOTS_DIR" "$CAPTURES_DIR" "$SHARED_DIR/tools" "$SHARED_DIR/game"
    info "Directory structure created."
}

# --- 6. Generate QEMU launch scripts ---
generate_launch_scripts() {

    # --- Interactive mode (with display, for RE work — boots from hard disk) ---
    cat > "$SCRIPT_DIR/run_interactive.sh" << 'LAUNCH'
#!/usr/bin/env bash
# Launch QEMU in interactive mode with display, GDB stub, and QMP socket.
# Boots from hard disk (FreeDOS must already be installed via run_install.sh).
# Shared ISO is mounted as the CD-ROM drive (D:).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

QEMU_ARGS=(
    # --- Machine ---
    -machine pc
    -m 32                           # 32MB RAM
    -rtc base=localtime

    # --- Storage ---
    -drive file="$DIR/vm/dos_hdd.qcow2",format=qcow2,if=ide,index=0
    -cdrom "$DIR/vm/shared.iso"
    -boot order=c                   # boot from hard disk

    # --- Display ---
    -display cocoa                  # native macOS window
    -vga std

    # --- Audio (Sound Blaster 16 → macOS CoreAudio) ---
    -audiodev coreaudio,id=audio0
    -device sb16,iobase=0x220,irq=5,dma=1,dma16=5,audiodev=audio0

    # --- Debug / Control ---
    -gdb tcp::1234                  # GDB stub on port 1234
    -qmp unix:"$DIR/vm/qmp.sock",server,nowait   # QMP control socket
    -monitor stdio                  # QEMU monitor on terminal

    # --- Snapshots ---
    # qcow2 supports internal snapshots; use 'savevm'/'loadvm' from monitor
)

echo "=== QEMU Interactive Mode ==="
echo "  GDB:     target remote localhost:1234"
echo "  QMP:     $DIR/vm/qmp.sock"
echo "  Monitor: this terminal (type 'help' for commands)"
echo ""
echo "  Useful monitor commands:"
echo "    savevm <name>    - save snapshot"
echo "    loadvm <name>    - restore snapshot"
echo "    info snapshots   - list snapshots"
echo "    screendump <f>   - save screenshot as PPM"
echo "    pmemsave <addr> <size> <file> - dump memory"
echo "    sendkey <key>    - inject keystroke"
echo ""

exec qemu-system-i386 "${QEMU_ARGS[@]}"
LAUNCH
    chmod +x "$SCRIPT_DIR/run_interactive.sh"

    # --- Headless mode (for CI / automated capture) ---
    cat > "$SCRIPT_DIR/run_headless.sh" << 'LAUNCH'
#!/usr/bin/env bash
# Launch QEMU in headless mode for automated testing.
# No display window — controlled entirely via QMP and GDB.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SNAPSHOT="${1:-}"  # optional: snapshot name to restore

QEMU_ARGS=(
    # --- Machine ---
    -machine pc
    -m 32
    -rtc base=localtime

    # --- Storage ---
    -drive file="$DIR/vm/dos_hdd.qcow2",format=qcow2,if=ide,index=0
    -cdrom "$DIR/vm/shared.iso"
    -boot order=c

    # --- Headless ---
    -display none
    -vnc :0                          # VNC on port 5900 (optional, for debugging)
    -vga std

    # --- Audio ---
    -audiodev none,id=audio0         # no audio output in headless
    -device sb16,iobase=0x220,irq=5,dma=1,dma16=5,audiodev=audio0

    # --- Debug / Control ---
    -gdb tcp::1234
    -qmp unix:"$DIR/vm/qmp.sock",server,nowait
    -monitor none

    # --- Serial for DOS stdout capture ---
    -serial file:"$DIR/captures/serial.log"
)

# Load a snapshot immediately if specified
if [[ -n "$SNAPSHOT" ]]; then
    QEMU_ARGS+=(-loadvm "$SNAPSHOT")
fi

echo "=== QEMU Headless Mode ==="
echo "  GDB:    target remote localhost:1234"
echo "  QMP:    $DIR/vm/qmp.sock"
echo "  VNC:    localhost:5900"
echo "  Serial: $DIR/captures/serial.log"
[[ -n "$SNAPSHOT" ]] && echo "  Loading snapshot: $SNAPSHOT"
echo ""

exec qemu-system-i386 "${QEMU_ARGS[@]}"
LAUNCH
    chmod +x "$SCRIPT_DIR/run_headless.sh"

    # --- Record/Replay mode ---
    cat > "$SCRIPT_DIR/run_record.sh" << 'LAUNCH'
#!/usr/bin/env bash
# Launch QEMU in record mode for deterministic replay.
# Records all non-deterministic events so you can replay the exact
# same execution later for analysis.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE="${1:-record}"   # 'record' or 'replay'
RR_FILE="${2:-$DIR/captures/game_session.rr}"

if [[ "$MODE" == "record" ]]; then
    echo "=== Recording session to: $RR_FILE ==="
    ICOUNT_ARG="-icount shift=auto,rr=record,rrfile=$RR_FILE"
elif [[ "$MODE" == "replay" ]]; then
    echo "=== Replaying session from: $RR_FILE ==="
    ICOUNT_ARG="-icount shift=auto,rr=replay,rrfile=$RR_FILE"
else
    echo "Usage: $0 [record|replay] [rr_file]"
    exit 1
fi

QEMU_ARGS=(
    -machine pc
    -m 32
    -rtc base=localtime

    -drive file="$DIR/vm/dos_hdd.qcow2",format=qcow2,if=ide,index=0,snapshot=on
    -cdrom "$DIR/vm/shared.iso"
    -boot order=c

    -display cocoa
    -vga std
    -device sb16,iobase=0x220,irq=5,dma=1,dma16=5

    -gdb tcp::1234
    -qmp unix:"$DIR/vm/qmp.sock",server,nowait
    -monitor stdio

    $ICOUNT_ARG
)

exec qemu-system-i386 "${QEMU_ARGS[@]}"
LAUNCH
    chmod +x "$SCRIPT_DIR/run_record.sh"

    # --- Rebuild shared ISO helper ---
    cat > "$SCRIPT_DIR/rebuild_shared.sh" << 'REBUILD'
#!/usr/bin/env bash
# Rebuild the shared ISO after adding/changing files in shared/
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkisofs -o "$DIR/vm/shared.iso" -V "SHARED" -r -J "$DIR/shared" 2>/dev/null
echo "Rebuilt: $DIR/vm/shared.iso"
REBUILD
    chmod +x "$SCRIPT_DIR/rebuild_shared.sh"

    info "Launch scripts generated."
}

# --- 7. Generate the Python test harness ---
generate_test_harness() {
    # Write shebang pointing to venv python, then append the rest with quoted heredoc
    echo "#!${SCRIPT_DIR}/.venv/bin/python3" > "$SCRIPT_DIR/harness.py"
    cat >> "$SCRIPT_DIR/harness.py" << 'PYTHON'
"""
DOS Game Test Harness

Drives QEMU via QMP (machine control) and GDB RSP (memory/debug)
to automate data capture from a DOS game for port testing.

Usage:
    # Start QEMU first (headless or interactive), then:
    python3 harness.py capture --snapshot level1_start --breakpoint 0x1A3F0
    python3 harness.py screenshot
    python3 harness.py dump-memory 0xA0000 64000 framebuffer.bin
    python3 harness.py inject-keys "right right right up enter"
"""

import argparse
import json
import os
import socket
import struct
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
QMP_SOCK = SCRIPT_DIR / "vm" / "qmp.sock"
GDB_HOST = "localhost"
GDB_PORT = 1234
CAPTURES_DIR = SCRIPT_DIR / "captures"


# ============================================================
# QMP Client — controls the VM (snapshots, keys, screenshots)
# ============================================================

class QMPClient:
    """Minimal QMP (QEMU Machine Protocol) client."""

    def __init__(self, sock_path: str):
        self.sock_path = sock_path
        self.sock = None

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.sock_path)
        # Read greeting
        greeting = self._recv()
        assert "QMP" in greeting, f"Bad QMP greeting: {greeting}"
        # Negotiate capabilities
        self._send({"execute": "qmp_capabilities"})
        resp = self._recv()
        print(f"[QMP] Connected to QEMU")
        return self

    def _send(self, cmd: dict):
        data = json.dumps(cmd).encode() + b"\n"
        self.sock.sendall(data)

    def _recv(self) -> dict:
        buf = b""
        while True:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("QMP socket closed")
            buf += chunk
            try:
                return json.loads(buf.decode())
            except json.JSONDecodeError:
                continue

    def execute(self, command: str, **kwargs) -> dict:
        msg = {"execute": command}
        if kwargs:
            msg["arguments"] = kwargs
        self._send(msg)
        # Skip events, wait for return
        while True:
            resp = self._recv()
            if "return" in resp or "error" in resp:
                return resp
            # else it's an event, skip

    def send_key(self, key: str, hold_ms: int = 100):
        """Send a single keystroke. Key names: 'up','down','left','right','ret','spc','esc', 'a'-'z', etc."""
        self.execute("send-key", keys=[{"type": "qcode", "data": key}], hold_time=hold_ms)

    def send_keys_sequence(self, keys: list[str], delay: float = 0.15):
        """Send a sequence of keystrokes with delay between each."""
        for key in keys:
            self.send_key(key)
            time.sleep(delay)

    def screendump(self, path: str):
        """Save a PPM screenshot."""
        return self.execute("screendump", filename=path)

    def save_snapshot(self, name: str):
        """Save VM snapshot (uses qcow2 internal snapshots)."""
        return self.execute("human-monitor-command", command_line=f"savevm {name}")

    def load_snapshot(self, name: str):
        """Load VM snapshot."""
        return self.execute("human-monitor-command", command_line=f"loadvm {name}")

    def dump_memory(self, addr: int, size: int, path: str):
        """Dump physical memory range to file."""
        return self.execute("human-monitor-command",
                            command_line=f"pmemsave {addr} {size} {path}")

    def quit(self):
        self.execute("quit")

    def close(self):
        if self.sock:
            self.sock.close()


# ============================================================
# GDB RSP Client — reads/writes memory, sets breakpoints
# ============================================================

class GDBClient:
    """Minimal GDB Remote Serial Protocol client for QEMU's GDB stub."""

    def __init__(self, host: str = GDB_HOST, port: int = GDB_PORT):
        self.host = host
        self.port = port
        self.sock = None

    def connect(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.connect((self.host, self.port))
        self.sock.settimeout(10.0)
        print(f"[GDB] Connected to {self.host}:{self.port}")
        return self

    def _send_packet(self, data: str):
        checksum = sum(data.encode()) % 256
        packet = f"${data}#{checksum:02x}"
        self.sock.sendall(packet.encode())

    def _recv_packet(self) -> str:
        buf = b""
        # Read until we get a complete $...#xx packet
        while True:
            byte = self.sock.recv(1)
            if not byte:
                raise ConnectionError("GDB connection closed")
            buf += byte
            if len(buf) >= 4 and buf[-3] == ord('#'):
                break

        # Strip $ prefix and #xx suffix
        raw = buf.decode()
        start = raw.index('$') + 1
        end = raw.index('#')
        payload = raw[start:end]

        # Send ACK
        self.sock.sendall(b"+")
        return payload

    def _command(self, cmd: str) -> str:
        # Consume any pending ACK
        self.sock.settimeout(0.1)
        try:
            self.sock.recv(1)
        except socket.timeout:
            pass
        self.sock.settimeout(10.0)

        self._send_packet(cmd)
        return self._recv_packet()

    def read_memory(self, addr: int, length: int) -> bytes:
        """Read memory from the guest. Address is LINEAR (not seg:off)."""
        result = b""
        chunk_size = 4096  # GDB protocol has packet size limits

        for offset in range(0, length, chunk_size):
            remaining = min(chunk_size, length - offset)
            resp = self._command(f"m{addr + offset:x},{remaining:x}")
            if resp.startswith("E"):
                raise RuntimeError(f"GDB memory read error at 0x{addr + offset:x}: {resp}")
            result += bytes.fromhex(resp)

        return result

    def write_memory(self, addr: int, data: bytes):
        """Write memory to the guest."""
        hex_data = data.hex()
        resp = self._command(f"M{addr:x},{len(data):x}:{hex_data}")
        if resp != "OK":
            raise RuntimeError(f"GDB memory write error: {resp}")

    def read_registers(self) -> dict:
        """Read all general registers (i386)."""
        resp = self._command("g")
        if resp.startswith("E"):
            raise RuntimeError(f"GDB register read error: {resp}")

        # i386 register order: eax, ecx, edx, ebx, esp, ebp, esi, edi, eip, eflags, cs, ss, ds, es, fs, gs
        reg_names = ["eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi",
                      "eip", "eflags", "cs", "ss", "ds", "es", "fs", "gs"]
        raw = bytes.fromhex(resp)
        regs = {}
        for i, name in enumerate(reg_names):
            if i < 10:  # 32-bit registers
                val = struct.unpack_from("<I", raw, i * 4)[0]
            else:  # 16-bit segment registers (stored as 32-bit in GDB)
                val = struct.unpack_from("<I", raw, i * 4)[0] & 0xFFFF
            regs[name] = val
        return regs

    def set_breakpoint(self, addr: int) -> str:
        """Set a software breakpoint at linear address."""
        resp = self._command(f"Z0,{addr:x},1")
        if resp != "OK":
            raise RuntimeError(f"Failed to set breakpoint at 0x{addr:x}: {resp}")
        print(f"[GDB] Breakpoint set at 0x{addr:x}")
        return resp

    def remove_breakpoint(self, addr: int):
        """Remove a software breakpoint."""
        self._command(f"z0,{addr:x},1")

    def continue_execution(self):
        """Resume guest execution."""
        self._send_packet("c")

    def stop(self):
        """Interrupt guest execution (send break)."""
        self.sock.sendall(b"\x03")

    def wait_for_stop(self, timeout: float = 30.0) -> str:
        """Wait for the guest to hit a breakpoint or stop."""
        self.sock.settimeout(timeout)
        try:
            return self._recv_packet()
        except socket.timeout:
            raise TimeoutError("Guest did not stop within timeout")

    def step(self):
        """Single-step one instruction."""
        return self._command("s")

    def close(self):
        if self.sock:
            self.sock.close()


# ============================================================
# Helper: segment:offset → linear address
# ============================================================

def seg_offset_to_linear(segment: int, offset: int) -> int:
    """Convert real-mode segment:offset to linear address."""
    return (segment << 4) + offset


# ============================================================
# Capture pipeline
# ============================================================

class GameCapture:
    """High-level capture operations combining QMP and GDB."""

    def __init__(self, qmp: QMPClient, gdb: GDBClient):
        self.qmp = qmp
        self.gdb = gdb
        CAPTURES_DIR.mkdir(parents=True, exist_ok=True)

    def capture_framebuffer_mode13h(self, filename: str = "framebuffer.bin"):
        """
        Capture the VGA Mode 13h framebuffer (320x200, 256 colors).
        The framebuffer is at linear address 0xA0000, 64000 bytes.
        """
        path = CAPTURES_DIR / filename
        data = self.gdb.read_memory(0xA0000, 64000)
        path.write_bytes(data)
        print(f"[Capture] Framebuffer saved: {path} ({len(data)} bytes)")
        return data

    def capture_memory_range(self, addr: int, size: int, filename: str):
        """Capture an arbitrary memory range."""
        path = CAPTURES_DIR / filename
        data = self.gdb.read_memory(addr, size)
        path.write_bytes(data)
        print(f"[Capture] Memory 0x{addr:X}+0x{size:X} saved: {path}")
        return data

    def capture_screenshot(self, filename: str = "screenshot.ppm"):
        """Take a screenshot via QMP (saves as PPM)."""
        path = str(CAPTURES_DIR / filename)
        self.qmp.screendump(path)
        print(f"[Capture] Screenshot saved: {path}")
        return path

    def capture_at_breakpoint(self, bp_addr: int, captures: dict, auto_continue: bool = True):
        """
        Set a breakpoint, wait for it to hit, then capture specified memory ranges.

        captures: dict of {filename: (addr, size)}
        """
        self.gdb.set_breakpoint(bp_addr)
        self.gdb.continue_execution()
        print(f"[Capture] Waiting for breakpoint at 0x{bp_addr:X}...")

        stop_reason = self.gdb.wait_for_stop(timeout=60)
        print(f"[Capture] Hit breakpoint. Stop reason: {stop_reason}")

        regs = self.gdb.read_registers()
        print(f"[Capture] EIP=0x{regs['eip']:08X} CS=0x{regs['cs']:04X}")

        results = {}
        for filename, (addr, size) in captures.items():
            results[filename] = self.capture_memory_range(addr, size, filename)

        self.gdb.remove_breakpoint(bp_addr)

        if auto_continue:
            self.gdb.continue_execution()

        return results

    def run_capture_sequence(self, snapshot: str, key_sequence: list[str],
                             wait_time: float = 2.0, prefix: str = "seq"):
        """
        Load a snapshot, inject a key sequence, wait, then capture
        framebuffer and screenshot. Used for golden-file test generation.
        """
        print(f"[Capture] Loading snapshot: {snapshot}")
        self.qmp.load_snapshot(snapshot)
        time.sleep(1.0)  # let VM settle

        print(f"[Capture] Injecting keys: {key_sequence}")
        self.qmp.send_keys_sequence(key_sequence)
        time.sleep(wait_time)

        # Pause the VM for consistent capture
        self.gdb.stop()
        self.gdb.wait_for_stop(timeout=5)

        fb = self.capture_framebuffer_mode13h(f"{prefix}_framebuffer.bin")
        ss = self.capture_screenshot(f"{prefix}_screenshot.ppm")
        regs = self.gdb.read_registers()

        # Save register state
        reg_path = CAPTURES_DIR / f"{prefix}_registers.json"
        reg_path.write_text(json.dumps(regs, indent=2))

        self.gdb.continue_execution()

        return {"framebuffer": fb, "screenshot": ss, "registers": regs}


# ============================================================
# CLI
# ============================================================

def cmd_screenshot(args):
    qmp = QMPClient(str(QMP_SOCK)).connect()
    cap = GameCapture(qmp, None)
    cap.capture_screenshot(args.output)
    qmp.close()

def cmd_dump_memory(args):
    gdb = GDBClient().connect()
    gdb.stop()
    gdb.wait_for_stop(timeout=5)
    data = gdb.read_memory(args.address, args.size)
    path = CAPTURES_DIR / args.output
    path.write_bytes(data)
    print(f"Saved {len(data)} bytes to {path}")
    gdb.continue_execution()
    gdb.close()

def cmd_inject_keys(args):
    qmp = QMPClient(str(QMP_SOCK)).connect()
    keys = args.keys.split()
    qmp.send_keys_sequence(keys, delay=args.delay)
    print(f"Injected {len(keys)} keystrokes")
    qmp.close()

def cmd_capture(args):
    qmp = QMPClient(str(QMP_SOCK)).connect()
    gdb = GDBClient().connect()
    cap = GameCapture(qmp, gdb)

    if args.snapshot:
        prefix = args.snapshot
        keys = args.keys.split() if args.keys else []
        cap.run_capture_sequence(args.snapshot, keys, wait_time=args.wait, prefix=prefix)
    elif args.breakpoint:
        bp_addr = int(args.breakpoint, 16)
        captures = {"capture_framebuffer.bin": (0xA0000, 64000)}
        cap.capture_at_breakpoint(bp_addr, captures)
    else:
        # Simple capture: pause, grab framebuffer, resume
        gdb.stop()
        gdb.wait_for_stop(timeout=5)
        cap.capture_framebuffer_mode13h()
        cap.capture_screenshot()
        gdb.continue_execution()

    qmp.close()
    gdb.close()

def cmd_registers(args):
    gdb = GDBClient().connect()
    gdb.stop()
    gdb.wait_for_stop(timeout=5)
    regs = gdb.read_registers()
    for name, val in regs.items():
        if name in ("cs", "ss", "ds", "es", "fs", "gs"):
            print(f"  {name:8s} = 0x{val:04X}")
        else:
            print(f"  {name:8s} = 0x{val:08X}")
    gdb.continue_execution()
    gdb.close()

def cmd_snapshot(args):
    qmp = QMPClient(str(QMP_SOCK)).connect()
    if args.action == "save":
        qmp.save_snapshot(args.name)
        print(f"Snapshot saved: {args.name}")
    elif args.action == "load":
        qmp.load_snapshot(args.name)
        print(f"Snapshot loaded: {args.name}")
    qmp.close()

def main():
    parser = argparse.ArgumentParser(description="DOS Game Test Harness")
    sub = parser.add_subparsers(dest="command")

    # screenshot
    p = sub.add_parser("screenshot", help="Take a screenshot")
    p.add_argument("-o", "--output", default="screenshot.ppm")

    # dump-memory
    p = sub.add_parser("dump-memory", help="Dump guest memory")
    p.add_argument("address", type=lambda x: int(x, 0), help="Linear address (hex)")
    p.add_argument("size", type=lambda x: int(x, 0), help="Size in bytes")
    p.add_argument("-o", "--output", default="memdump.bin")

    # inject-keys
    p = sub.add_parser("inject-keys", help="Send keystrokes to VM")
    p.add_argument("keys", help="Space-separated key names (e.g., 'right right up ret')")
    p.add_argument("-d", "--delay", type=float, default=0.15)

    # capture
    p = sub.add_parser("capture", help="Capture game state")
    p.add_argument("-s", "--snapshot", help="Load this snapshot first")
    p.add_argument("-b", "--breakpoint", help="Break at this address (hex)")
    p.add_argument("-k", "--keys", help="Key sequence to inject after snapshot load")
    p.add_argument("-w", "--wait", type=float, default=2.0, help="Wait time after keys")

    # registers
    sub.add_parser("registers", help="Dump CPU registers")

    # snapshot
    p = sub.add_parser("snapshot", help="Save/load VM snapshot")
    p.add_argument("action", choices=["save", "load"])
    p.add_argument("name", help="Snapshot name")

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
        "snapshot": cmd_snapshot,
    }[args.command](args)

if __name__ == "__main__":
    main()
PYTHON
    chmod +x "$SCRIPT_DIR/harness.py"
    info "Python test harness generated: harness.py"
}

# --- 8. Generate example test script ---
generate_example_test() {
    echo "#!${SCRIPT_DIR}/.venv/bin/python3" > "$SCRIPT_DIR/example_test.py"
    cat >> "$SCRIPT_DIR/example_test.py" << 'PYTHON'
"""
Example: automated golden-file test generation.

This shows the full workflow:
1. Boot the VM with a saved snapshot (game already running at a known state)
2. Inject inputs
3. Capture the resulting game state
4. Compare against golden files from a previous run

Adapt the addresses, snapshot names, and key sequences to your game.
"""
import hashlib
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))

from harness import QMPClient, GDBClient, GameCapture, seg_offset_to_linear, CAPTURES_DIR

QMP_SOCK = Path(__file__).parent / "vm" / "qmp.sock"
GOLDEN_DIR = Path(__file__).parent / "golden"


def generate_golden_files():
    """Run once to create the reference data from the original game."""
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)

    qmp = QMPClient(str(QMP_SOCK)).connect()
    gdb = GDBClient().connect()
    cap = GameCapture(qmp, gdb)

    # -------------------------------------------------------
    # CUSTOMIZE THESE FOR YOUR GAME
    # -------------------------------------------------------

    # Example: game data segment starts at DS:0000
    # After finding DS in the debugger (e.g., DS=0x2A30), compute linear:
    GAME_DS = 0x2A30                   # <-- from your RE work in DOSBox-X
    GAME_STATE_OFFSET = 0x0100         # <-- offset of interesting game state
    GAME_STATE_SIZE = 256              # <-- how much to capture
    GAME_STATE_LINEAR = seg_offset_to_linear(GAME_DS, GAME_STATE_OFFSET)

    tests = [
        {
            "name": "idle",
            "snapshot": "game_start",
            "keys": [],
            "wait": 1.0,
        },
        {
            "name": "move_right",
            "snapshot": "game_start",
            "keys": ["right", "right", "right"],
            "wait": 0.5,
        },
        {
            "name": "jump",
            "snapshot": "game_start",
            "keys": ["spc"],
            "wait": 1.0,
        },
    ]

    for test in tests:
        print(f"\n=== Generating golden: {test['name']} ===")

        qmp.load_snapshot(test["snapshot"])
        import time; time.sleep(0.5)

        if test["keys"]:
            qmp.send_keys_sequence(test["keys"])
            time.sleep(test["wait"])

        gdb.stop()
        gdb.wait_for_stop(timeout=5)

        # Capture framebuffer
        fb = gdb.read_memory(0xA0000, 64000)
        (GOLDEN_DIR / f"{test['name']}_fb.bin").write_bytes(fb)

        # Capture game state
        state = gdb.read_memory(GAME_STATE_LINEAR, GAME_STATE_SIZE)
        (GOLDEN_DIR / f"{test['name']}_state.bin").write_bytes(state)

        # Save checksums for quick comparison
        checksums = {
            "framebuffer_sha256": hashlib.sha256(fb).hexdigest(),
            "state_sha256": hashlib.sha256(state).hexdigest(),
        }
        import json
        (GOLDEN_DIR / f"{test['name']}_checksums.json").write_text(
            json.dumps(checksums, indent=2))

        print(f"  FB checksum:    {checksums['framebuffer_sha256'][:16]}...")
        print(f"  State checksum: {checksums['state_sha256'][:16]}...")

        gdb.continue_execution()

    qmp.close()
    gdb.close()
    print(f"\nGolden files saved to: {GOLDEN_DIR}")


def compare_port_output(test_name: str, port_fb: bytes, port_state: bytes) -> bool:
    """
    Compare your port's output against the golden files.
    Call this from your port's test suite.
    """
    golden_fb = (GOLDEN_DIR / f"{test_name}_fb.bin").read_bytes()
    golden_state = (GOLDEN_DIR / f"{test_name}_state.bin").read_bytes()

    fb_match = (golden_fb == port_fb)
    state_match = (golden_state == port_state)

    if not fb_match:
        # Find first differing byte for debugging
        for i, (a, b) in enumerate(zip(golden_fb, port_fb)):
            if a != b:
                print(f"  FB mismatch at offset {i}: golden=0x{a:02X} port=0x{b:02X}")
                break

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
PYTHON
    chmod +x "$SCRIPT_DIR/example_test.py"
    info "Example test script generated: example_test.py"
}

# --- 9. Generate README ---
generate_readme() {
    cat > "$SCRIPT_DIR/README.md" << 'MD'
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
MD
    info "README generated."
}

# ============================================================
# Main
# ============================================================

main() {
    echo ""
    echo "╔══════════════════════════════════════════╗"
    echo "║    DOS Game Test Harness Setup           ║"
    echo "║    QEMU + FreeDOS + GDB + QMP            ║"
    echo "╚══════════════════════════════════════════╝"
    echo ""

    install_deps
    download_freedos
    create_dirs
    create_shared_iso
    generate_launch_scripts
    generate_test_harness
    generate_example_test
    generate_readme

    echo ""
    info "Setup complete!"
    echo ""
    echo "  Next steps:"
    echo "    1. ./run_interactive.sh     — boot FreeDOS (shared ISO as D:)"
    echo "    2. Put game files in shared/game/, then ./rebuild_shared.sh"
    echo "    3. Boot, install game, create snapshots"
    echo "    4. python3 harness.py --help"
    echo ""
    echo "  See README.md for full documentation."
    echo ""
}

main "$@"