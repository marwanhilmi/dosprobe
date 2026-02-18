#!/usr/bin/env bash
# Rebuild the shared ISO after adding/changing files in shared/
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkisofs -o "$DIR/vm/shared.iso" -V "SHARED" -r -J "$DIR/shared" 2>/dev/null
echo "Rebuilt: $DIR/vm/shared.iso"
