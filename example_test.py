#!/Users/m4/Development/RR/EXPLORE/dostest/.venv/bin/python3
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
