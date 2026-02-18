#!/usr/bin/env bash
# Launch QEMU in interactive mode with display, GDB stub, and QMP socket.
# Boots from hard disk (FreeDOS pre-installed).
#
# Usage:
#   ./run_interactive.sh                      # shared ISO as D:
#   ./run_interactive.sh game-disk1.iso       # game as D:, shared as E:
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GAME_ISO="${1:-}"

QEMU_ARGS=(
    # --- Machine ---
    -machine pc
    -m 32                           # 32MB RAM
    -rtc base=localtime

    # --- Storage ---
    -drive file="$DIR/vm/dos_hdd.qcow2",format=qcow2,if=ide,index=0
    -boot order=c                   # boot from hard disk
)

# --- CD-ROM drives ---
# IDE layout: index 0 = HDD, index 2 = primary CD (D:), index 3 = secondary CD (E:)
if [[ -n "$GAME_ISO" ]]; then
    QEMU_ARGS+=(-drive file="$GAME_ISO",media=cdrom,if=ide,index=2)
    QEMU_ARGS+=(-drive file="$DIR/vm/shared.iso",media=cdrom,if=ide,index=3)
else
    QEMU_ARGS+=(-cdrom "$DIR/vm/shared.iso")
fi

QEMU_ARGS+=(
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
if [[ -n "$GAME_ISO" ]]; then
    echo "  Game CD: $GAME_ISO (D:)"
    echo "  Shared:  $DIR/vm/shared.iso (E:)"
else
    echo "  Shared:  $DIR/vm/shared.iso (D:)"
fi
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
