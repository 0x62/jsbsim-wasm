#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JSBSIM_DIR="$ROOT_DIR/vendor/jsbsim"
TARGET_REF="origin/master"
TARGET_TAG=""
USE_LATEST_TAG=0
SYNC_PACKAGE_VERSION=0
TARGET_VERSION=""
BETA_OVERRIDE=""
SKIP_BUILD=0

usage() {
  cat <<USAGE
Usage: ./scripts/update-jsbsim.sh [options]

Options:
  --ref <ref>             checkout a JSBSim git ref (default: origin/master)
  --tag <vX.Y.Z>          checkout a specific JSBSim release tag
  --latest-tag            checkout the latest stable JSBSim release tag
  --sync-version          set package.json version to <jsbsim>-beta.<N>
  --target-version <ver>  use this package version instead of auto-resolving
  --beta <N>              override beta suffix when auto-resolving version
  --skip-build            skip regenerate/build steps after checkout
  -h, --help              show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      TARGET_REF="${2:-}"
      shift 2
      ;;
    --tag)
      TARGET_TAG="${2:-}"
      shift 2
      ;;
    --latest-tag)
      USE_LATEST_TAG=1
      shift
      ;;
    --sync-version)
      SYNC_PACKAGE_VERSION=1
      shift
      ;;
    --target-version)
      TARGET_VERSION="${2:-}"
      shift 2
      ;;
    --beta)
      BETA_OVERRIDE="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -n "$TARGET_TAG" && $USE_LATEST_TAG -eq 1 ]]; then
  echo "error: --tag and --latest-tag are mutually exclusive." >&2
  exit 1
fi

"$ROOT_DIR/scripts/prepare-jsbsim.sh"
git -C "$JSBSIM_DIR" fetch origin --tags

if [[ $USE_LATEST_TAG -eq 1 ]]; then
  eval "$(node "$ROOT_DIR/scripts/resolve-jsbsim-release.mjs" --format env)"
  TARGET_TAG="$JSBSIM_TAG"
fi

if [[ -n "$TARGET_TAG" ]]; then
  git -C "$JSBSIM_DIR" checkout "tags/$TARGET_TAG"
elif [[ "$TARGET_REF" == origin/* ]]; then
  LOCAL_BRANCH="${TARGET_REF#origin/}"
  git -C "$JSBSIM_DIR" checkout "$LOCAL_BRANCH"
  git -C "$JSBSIM_DIR" pull --ff-only origin "$LOCAL_BRANCH"
else
  git -C "$JSBSIM_DIR" checkout "$TARGET_REF"
fi

"$ROOT_DIR/scripts/apply-jsbsim-patches.sh"

if [[ $SKIP_BUILD -eq 0 ]]; then
  node "$ROOT_DIR/scripts/generate-fgfdmexec-bindings.mjs"
  "$ROOT_DIR/scripts/build-wasm.sh"

  if command -v npm >/dev/null 2>&1 && [[ -d "$ROOT_DIR/node_modules" ]]; then
    npm --prefix "$ROOT_DIR" run build:sdk
  else
    echo "Skipping SDK build (run 'npm install' first to enable it)."
  fi
fi

if [[ $SYNC_PACKAGE_VERSION -eq 1 ]]; then
  if [[ -z "$TARGET_VERSION" ]]; then
    RESOLVE_ARGS=(--format env)
    if [[ -n "$TARGET_TAG" ]]; then
      RESOLVE_ARGS+=(--jsbsim-tag "$TARGET_TAG")
    fi
    if [[ -n "$BETA_OVERRIDE" ]]; then
      RESOLVE_ARGS+=(--beta "$BETA_OVERRIDE")
    fi

    eval "$(node "$ROOT_DIR/scripts/resolve-jsbsim-release.mjs" "${RESOLVE_ARGS[@]}")"
    TARGET_VERSION="$PACKAGE_VERSION"
  fi

  npm --prefix "$ROOT_DIR" version "$TARGET_VERSION" --no-git-tag-version
  echo "Set package version to $TARGET_VERSION"
fi

echo "Updated JSBSim to $(git -C "$JSBSIM_DIR" rev-parse --short HEAD)"
