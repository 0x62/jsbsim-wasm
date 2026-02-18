#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<USAGE
Usage: ./scripts/release.sh <version> [options]

Options:
  --npm-tag <tag>     npm dist-tag metadata (default: latest)
  --skip-build        skip npm run build
  --skip-commit       do not create a release commit
  --skip-tag          do not create an annotated git tag
  --allow-dirty       allow running with uncommitted changes
  --dry-run           print planned actions only

Example:
  ./scripts/release.sh 0.2.0 --npm-tag next
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

VERSION="$1"
shift

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "error: version must be semver-like (e.g. 1.2.3 or 1.2.3-rc.1)" >&2
  exit 1
fi

NPM_TAG="latest"
SKIP_BUILD=0
SKIP_COMMIT=0
SKIP_TAG=0
ALLOW_DIRTY=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --npm-tag)
      NPM_TAG="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-commit)
      SKIP_COMMIT=1
      shift
      ;;
    --skip-tag)
      SKIP_TAG=1
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
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

if [[ $ALLOW_DIRTY -eq 0 ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "error: working tree is not clean. Commit or stash changes, or use --allow-dirty." >&2
    exit 1
  fi
fi

TAG="v$VERSION"
if [[ $SKIP_TAG -eq 0 ]] && git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag '$TAG' already exists" >&2
  exit 1
fi

run_cmd() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[dry-run] $*"
  else
    echo "+ $*"
    "$@"
  fi
}

run_cmd npm version "$VERSION" --no-git-tag-version

if [[ $SKIP_BUILD -eq 0 ]]; then
  run_cmd npm run build
fi

run_cmd node ./scripts/write-publish-metadata.mjs --version "$VERSION" --npm-tag "$NPM_TAG"

if [[ $SKIP_COMMIT -eq 0 ]]; then
  run_cmd git add -A
  run_cmd git commit -m "chore(release): v$VERSION"
fi

if [[ $SKIP_TAG -eq 0 ]]; then
  run_cmd git tag -a "$TAG" -m "Release $TAG"
fi

echo "Release preparation complete."
if [[ $SKIP_TAG -eq 0 ]]; then
  echo "Created tag: $TAG"
fi
echo "Publish metadata: release/publish-metadata.json"
