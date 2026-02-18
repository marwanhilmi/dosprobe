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
