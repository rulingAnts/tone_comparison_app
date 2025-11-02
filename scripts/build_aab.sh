#!/usr/bin/env bash
# Build a release Android App Bundle (AAB) using Gradle (Starter Template)
# Falls back to 'gradle' if './gradlew' is not available.
# Produces a friendly-named copy in ./dist by default.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
APP_DIR="$ROOT_DIR/mobile_app"
ANDROID_DIR="$APP_DIR/android"
OUT_DIR="$ROOT_DIR/dist"
OUT_NAME=""
DO_ANALYZE=1

log() { echo -e "\033[1;36m[starter_aab]\033[0m $*"; }
err() { echo -e "\033[1;31m[starter_aab][error]\033[0m $*" 1>&2; }

usage() {
  cat <<EOF
Build a release Android App Bundle (AAB) using Gradle (Starter Template)

Options:
  --out-dir <path>   Output directory for a friendly-named copy (default: dist)
  --out-name <name>  Filename for the copied AAB (default: StarterApp-<version>.aab)
  --no-analyze       Skip 'flutter analyze'
  -h, --help         Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --out-name) OUT_NAME="${2:-}"; shift 2 ;;
    --no-analyze) DO_ANALYZE=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 2 ;;
  esac
done

if [[ ! -d "$APP_DIR" ]]; then
  err "Flutter app dir not found: $APP_DIR"; exit 1
fi

command -v flutter >/dev/null 2>&1 || { err "flutter not found in PATH"; exit 1; }

pushd "$APP_DIR" >/dev/null
if [[ $DO_ANALYZE -eq 1 ]]; then
  log "Running flutter analyze..."
  flutter analyze || true
fi
popd >/dev/null

cd "$ANDROID_DIR"

GRADLEW="./gradlew"
if [[ ! -x "$GRADLEW" ]]; then
  if command -v gradle >/dev/null 2>&1; then
    GRADLEW="gradle"
    log "gradlew not found, using 'gradle' from PATH"
  else
    err "Neither ./gradlew nor 'gradle' found. Generate wrapper or install Gradle."; exit 1
  fi
fi

log "Building release AAB via Gradle..."
$GRADLEW :app:bundleRelease

AAB_PATH="$APP_DIR/build/app/outputs/bundle/release/app-release.aab"
if [[ ! -f "$AAB_PATH" ]]; then
  err "AAB not found at $AAB_PATH"; exit 1
fi
log "Built: $AAB_PATH"

APP_VERSION_LINE=$(sed -n 's/^version:[[:space:]]*\(.*\)$/\1/p' "$APP_DIR/pubspec.yaml" | head -n1 || true)
APP_VERSION_NAME=$(printf "%s" "$APP_VERSION_LINE" | cut -d'+' -f1)
APP_VERSION_CODE=$(printf "%s" "$APP_VERSION_LINE" | cut -s -d'+' -f2)
[[ -z "$APP_VERSION_NAME" ]] && APP_VERSION_NAME="0.0.0"
[[ -z "$APP_VERSION_CODE" ]] && APP_VERSION_CODE="0"

mkdir -p "$OUT_DIR"
DEFAULT_NAME="StarterApp-${APP_VERSION_NAME}+${APP_VERSION_CODE}.aab"
FINAL_NAME=${OUT_NAME:-"$DEFAULT_NAME"}
DEST="$OUT_DIR/$FINAL_NAME"
cp -f "$AAB_PATH" "$DEST"
log "Copied to: $DEST"
