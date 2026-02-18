#!/Users/m4/Development/RR/EXPLORE/dostest/dosbox-x/.venv/bin/python3
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
