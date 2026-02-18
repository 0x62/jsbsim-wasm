#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATCH_FILE="$ROOT_DIR/patches/jsbsim-emscripten-compat.patch"
JSBSIM_DIR="$ROOT_DIR/vendor/jsbsim"

if [[ ! -f "$PATCH_FILE" ]]; then
  exit 0
fi

if [[ ! -d "$JSBSIM_DIR/.git" && ! -f "$JSBSIM_DIR/.git" ]]; then
  echo "error: JSBSim submodule not initialized at $JSBSIM_DIR" >&2
  exit 1
fi

if git -C "$JSBSIM_DIR" apply --check "$PATCH_FILE" >/dev/null 2>&1; then
  git -C "$JSBSIM_DIR" apply "$PATCH_FILE"
  echo "Applied JSBSim Emscripten compatibility patch."
elif git -C "$JSBSIM_DIR" apply --reverse --check "$PATCH_FILE" >/dev/null 2>&1; then
  echo "JSBSim Emscripten compatibility patch already applied."
else
  echo "error: could not apply JSBSim compatibility patch: $PATCH_FILE" >&2
  exit 1
fi
