#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/dist/wasm"
DEST_DIR="$ROOT_DIR/demo/public/wasm"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "error: $SRC_DIR does not exist. Run 'npm run build:wasm' first." >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC_DIR/jsbsim_wasm.mjs" "$DEST_DIR/jsbsim_wasm.mjs"
cp "$SRC_DIR/jsbsim_wasm.wasm" "$DEST_DIR/jsbsim_wasm.wasm"

if [[ -f "$SRC_DIR/jsbsim_wasm.data" ]]; then
  cp "$SRC_DIR/jsbsim_wasm.data" "$DEST_DIR/jsbsim_wasm.data"
fi

echo "Copied WASM assets into demo/public/wasm"
