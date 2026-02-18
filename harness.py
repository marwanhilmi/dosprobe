#!/Users/m4/Development/RR/EXPLORE/dostest/.venv/bin/python3
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
