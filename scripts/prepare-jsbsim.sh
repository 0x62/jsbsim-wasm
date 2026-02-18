#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

git submodule update --init --recursive vendor/jsbsim
"$ROOT_DIR/scripts/apply-jsbsim-patches.sh"
