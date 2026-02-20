#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<USAGE
Usage: ./scripts/release.sh [options]

Options:
  --jsbsim-tag <tag>  release against a specific JSBSim tag (default: latest stable tag)
  --beta <N>          force beta suffix number (default: auto-increment from npm)
  --npm-tag <tag>     npm publish tag (default: beta)
  --skip-demo-check   skip demo prepare/build validation
  --allow-dirty       allow running with uncommitted changes
  --dry-run           print planned actions only

Example:
  ./scripts/release.sh --jsbsim-tag v1.2.4
USAGE
}

JSBSIM_TAG=""
BETA_OVERRIDE=""
NPM_TAG="beta"
SKIP_DEMO_CHECK=0
ALLOW_DIRTY=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --jsbsim-tag)
      JSBSIM_TAG="${2:-}"
      shift 2
      ;;
    --beta)
      BETA_OVERRIDE="${2:-}"
      shift 2
      ;;
    --npm-tag)
      NPM_TAG="${2:-}"
      shift 2
      ;;
    --skip-demo-check)
      SKIP_DEMO_CHECK=1
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
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

if [[ -n "$BETA_OVERRIDE" ]] && [[ ! "$BETA_OVERRIDE" =~ ^[1-9][0-9]*$ ]]; then
  echo "error: --beta must be a positive integer." >&2
  exit 1
fi

cd "$ROOT_DIR"

if [[ $ALLOW_DIRTY -eq 0 ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "error: working tree is not clean. Commit or stash changes, or use --allow-dirty." >&2
    exit 1
  fi
fi

run_cmd() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    echo "+ $*"
    "$@"
  fi
}

ensure_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

ensure_cmd npm
ensure_cmd gh
ensure_cmd git

run_cmd git -C vendor/jsbsim fetch origin --tags

RESOLVE_ARGS=(--format env)
if [[ -n "$JSBSIM_TAG" ]]; then
  RESOLVE_ARGS+=(--jsbsim-tag "$JSBSIM_TAG")
fi
if [[ -n "$BETA_OVERRIDE" ]]; then
  RESOLVE_ARGS+=(--beta "$BETA_OVERRIDE")
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] node ./scripts/resolve-jsbsim-release.mjs ${RESOLVE_ARGS[*]}"
fi

eval "$(node "$ROOT_DIR/scripts/resolve-jsbsim-release.mjs" "${RESOLVE_ARGS[@]}")"

VERSION="$PACKAGE_VERSION"
TAG="v$VERSION"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag '$TAG' already exists." >&2
  exit 1
fi

UPDATE_ARGS=(--tag "$JSBSIM_TAG" --sync-version --target-version "$VERSION")
if [[ -n "$BETA_OVERRIDE" ]]; then
  UPDATE_ARGS+=(--beta "$BETA_OVERRIDE")
fi
run_cmd "$ROOT_DIR/scripts/update-jsbsim.sh" "${UPDATE_ARGS[@]}"

run_cmd npm run typecheck
if [[ $SKIP_DEMO_CHECK -eq 0 ]]; then
  run_cmd npm run demo:install
  run_cmd npm run demo:prepare
  run_cmd npm run demo:build
fi
run_cmd node ./scripts/write-publish-metadata.mjs --version "$VERSION" --npm-tag "$NPM_TAG" --jsbsim-tag "$JSBSIM_TAG"

DIST_ARCHIVE="release/dist-$VERSION.tar.gz"
run_cmd tar -czf "$DIST_ARCHIVE" -C "$ROOT_DIR" dist

run_cmd git add -A
run_cmd git commit -m "chore(release): $TAG (JSBSim $JSBSIM_TAG)"
run_cmd git tag -a "$TAG" -m "Release $TAG (JSBSim $JSBSIM_TAG)"
run_cmd npm publish --tag "$NPM_TAG" --access public
run_cmd git push origin HEAD
run_cmd git push origin "$TAG"
run_cmd gh release create "$TAG" "$DIST_ARCHIVE" "release/publish-metadata.json" \
  --title "$TAG" \
  --notes "Automated release for JSBSim $JSBSIM_TAG."

echo "Release complete."
echo "- package version: $VERSION"
echo "- JSBSim tag: $JSBSIM_TAG"
echo "- npm tag: $NPM_TAG"
echo "- git tag: $TAG"
echo "- dist archive: $DIST_ARCHIVE"
