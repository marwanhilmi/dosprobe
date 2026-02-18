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
