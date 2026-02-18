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
