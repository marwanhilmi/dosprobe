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
