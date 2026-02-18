#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JSBSIM_DIR="$ROOT_DIR/vendor/jsbsim"
TARGET_REF="${1:-origin/master}"

"$ROOT_DIR/scripts/prepare-jsbsim.sh"

git -C "$JSBSIM_DIR" fetch origin --tags

if [[ "$TARGET_REF" == origin/* ]]; then
  LOCAL_BRANCH="${TARGET_REF#origin/}"
  git -C "$JSBSIM_DIR" checkout "$LOCAL_BRANCH"
  git -C "$JSBSIM_DIR" pull --ff-only origin "$LOCAL_BRANCH"
else
  git -C "$JSBSIM_DIR" checkout "$TARGET_REF"
fi

"$ROOT_DIR/scripts/apply-jsbsim-patches.sh"

node "$ROOT_DIR/scripts/generate-fgfdmexec-bindings.mjs"
"$ROOT_DIR/scripts/build-wasm.sh"

if command -v npm >/dev/null 2>&1 && [[ -d "$ROOT_DIR/node_modules" ]]; then
  npm --prefix "$ROOT_DIR" run build:sdk
else
  echo "Skipping SDK build (run 'npm install' first to enable it)."
fi

echo "Updated JSBSim to $(git -C "$JSBSIM_DIR" rev-parse --short HEAD)"
