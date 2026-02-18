#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build/wasm"
DIST_DIR="$ROOT_DIR/dist/wasm"
BINDINGS_FILE="$ROOT_DIR/generated/FGFDMExecBindings.cpp"

if ! command -v emcmake >/dev/null 2>&1; then
  echo "error: emcmake is not available. Activate emsdk first (e.g. 'source /path/to/emsdk_env.sh')." >&2
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "error: cmake is required." >&2
  exit 1
fi

if [[ ! -f "$BINDINGS_FILE" ]]; then
  echo "info: generating bindings..."
  node "$ROOT_DIR/scripts/generate-fgfdmexec-bindings.mjs"
fi

"$ROOT_DIR/scripts/prepare-jsbsim.sh"

emcmake cmake \
  -S "$ROOT_DIR/cmake" \
  -B "$BUILD_DIR" \
  -DJSBSIM_SOURCE_DIR="$ROOT_DIR/vendor/jsbsim" \
  -DJSBSIM_WASM_BINDINGS="$BINDINGS_FILE" \
  -DCMAKE_BUILD_TYPE=Release

cmake --build "$BUILD_DIR" --target jsbsim_wasm --parallel

if [[ ! -f "$BUILD_DIR/jsbsim_wasm.mjs" || ! -f "$BUILD_DIR/jsbsim_wasm.wasm" ]]; then
  echo "error: jsbsim_wasm build did not emit expected outputs in $BUILD_DIR" >&2
  exit 1
fi

mkdir -p "$DIST_DIR"
cp "$BUILD_DIR/jsbsim_wasm.mjs" "$DIST_DIR/jsbsim_wasm.mjs"
cp "$BUILD_DIR/jsbsim_wasm.wasm" "$DIST_DIR/jsbsim_wasm.wasm"

if [[ -f "$BUILD_DIR/jsbsim_wasm.data" ]]; then
  cp "$BUILD_DIR/jsbsim_wasm.data" "$DIST_DIR/jsbsim_wasm.data"
fi

echo "Built WASM artifacts in $DIST_DIR"
