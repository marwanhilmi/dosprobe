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
    -audiodev coreaudio,id=audio0
    -device sb16,iobase=0x220,irq=5,dma=1,dma16=5,audiodev=audio0

    -gdb tcp::1234
    -qmp unix:"$DIR/vm/qmp.sock",server,nowait
    -monitor stdio

    $ICOUNT_ARG
)

exec qemu-system-i386 "${QEMU_ARGS[@]}"
