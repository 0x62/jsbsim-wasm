#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_PATCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-patch)
      SKIP_PATCH=1
      shift
      ;;
    -h|--help)
      cat <<USAGE
Usage: ./scripts/prepare-jsbsim.sh [options]

Options:
  --skip-patch  initialize/update the submodule without applying local patches
  -h, --help    show this help
USAGE
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

git submodule update --init --recursive vendor/jsbsim

if [[ $SKIP_PATCH -eq 0 ]]; then
  "$ROOT_DIR/scripts/apply-jsbsim-patches.sh"
fi
