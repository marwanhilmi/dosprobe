#!/Users/m4/Development/RR/EXPLORE/dostest/dosbox-x/.venv/bin/python3
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
