#!/usr/bin/env bash
# Initialize a new Flutter Android project from the starter template.
# Prompts for identifiers and copies/renames files accordingly.
#
# Usage:
#   templates/flutter_android_starter/scripts/new_project.sh
#
# After completion, you'll have a new folder with:
#   - scripts/ (build_apk.sh, build_aab.sh)
#   - mobile_app/ (Flutter project with Android scaffold)
#   - .vscode/tasks.json (optional: copy from templates root)

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TEMPLATE_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
REPO_ROOT=$(cd "$TEMPLATE_ROOT/../.." && pwd)
TEMPLATES_VSCODE="$TEMPLATE_ROOT/.vscode"

# Helpers ---------------------------------------------------------------------
red() { echo -e "\033[1;31m$*\033[0m"; }
green() { echo -e "\033[1;32m$*\033[0m"; }
cyan() { echo -e "\033[1;36m$*\033[0m"; }

confirm() { read -r -p "$1 [y/N]: " resp; [[ $resp == "y" || $resp == "Y" ]]; }

# sed in-place that works on macOS and Linux
inplace() {
  local file="$1"; shift
  if sed --version >/dev/null 2>&1; then
    sed -i "$@" "$file"
  else
    # macOS BSD sed
    sed -i '' "$@" "$file"
  fi
}

replace_in_file() {
  local file="$1"; local from="$2"; local to="$3"
  if [[ ! -f "$file" ]]; then return 0; fi
  if sed --version >/dev/null 2>&1; then
    sed -i "s#${from//\/#}#${to//\/#}#g" "$file"
  else
    sed -i '' "s#${from//\/#}#${to//\/#}#g" "$file"
  fi
}

# Prompts ---------------------------------------------------------------------
read -r -p "Output directory for new project (default: ./new_flutter_app): " OUT_DIR
OUT_DIR=${OUT_DIR:-"$(pwd)/new_flutter_app"}
mkdir -p "$OUT_DIR"

read -r -p "Dart package name (lower_snake_case) [starter_app]: " PKG_DART
PKG_DART=${PKG_DART:-starter_app}

read -r -p "Android applicationId / package (reverse.domain.name) [com.example.starter_app]: " PKG_ANDROID
PKG_ANDROID=${PKG_ANDROID:-com.example.starter_app}

read -r -p "App display name [Starter App]: " APP_NAME
APP_NAME=${APP_NAME:-Starter App}

read -r -p "Short description for pubspec [Flutter Android Starter app]: " APP_DESC
APP_DESC=${APP_DESC:-Flutter Android Starter app}

cyan "\nCreating project at: $OUT_DIR"

# Copy template tree ----------------------------------------------------------
rsync -a --exclude ".DS_Store" "$TEMPLATE_ROOT/scripts" "$OUT_DIR/" 2>/dev/null || cp -R "$TEMPLATE_ROOT/scripts" "$OUT_DIR/"
rsync -a --exclude ".DS_Store" "$TEMPLATE_ROOT/mobile_app" "$OUT_DIR/" 2>/dev/null || cp -R "$TEMPLATE_ROOT/mobile_app" "$OUT_DIR/"

# Copy VS Code tasks from the template
if [[ -d "$TEMPLATES_VSCODE" ]]; then
  mkdir -p "$OUT_DIR/.vscode"
  rsync -a "$TEMPLATES_VSCODE/" "$OUT_DIR/.vscode/" 2>/dev/null || cp -R "$TEMPLATES_VSCODE/." "$OUT_DIR/.vscode/"
fi

# Rewrite identifiers ---------------------------------------------------------
APP_DIR="$OUT_DIR/mobile_app"
ANDROID_DIR="$APP_DIR/android"
APP_BUILD_GRADLE="$ANDROID_DIR/app/build.gradle.kts"
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
KOTLIN_ROOT="$ANDROID_DIR/app/src/main/kotlin"
KOTLIN_OLD_DIR="$KOTLIN_ROOT/com/example/starter_app"
STRINGS_XML="$ANDROID_DIR/app/src/main/res/values/strings.xml"
PUBSPEC="$APP_DIR/pubspec.yaml"

# Update pubspec: name & description
replace_in_file "$PUBSPEC" "name: starter_app" "name: $PKG_DART"
replace_in_file "$PUBSPEC" "description: \"Flutter Android Starter with reliable Gradle setup\"" "description: \"$APP_DESC\""

# Update app/build.gradle.kts: namespace + applicationId
replace_in_file "$APP_BUILD_GRADLE" "com.example.starter_app" "$PKG_ANDROID"

# Update AndroidManifest package and activity
replace_in_file "$MANIFEST" "package=\"com.example.starter_app\"" "package=\"$PKG_ANDROID\""
replace_in_file "$MANIFEST" "com.example.starter_app.MainActivity" "$PKG_ANDROID.MainActivity"

# Update strings.xml app_name
replace_in_file "$STRINGS_XML" ">Starter App<" ">$APP_NAME<"

# Move Kotlin package directory
IFS='.' read -r -a PKG_PARTS <<< "$PKG_ANDROID"
NEW_KOTLIN_DIR="$KOTLIN_ROOT"
for PART in "${PKG_PARTS[@]}"; do
  NEW_KOTLIN_DIR="$NEW_KOTLIN_DIR/$PART"
done
mkdir -p "$NEW_KOTLIN_DIR"
if [[ -d "$KOTLIN_OLD_DIR" ]]; then
  # Move MainActivity.kt and update package declaration
  if [[ -f "$KOTLIN_OLD_DIR/MainActivity.kt" ]]; then
    mv "$KOTLIN_OLD_DIR/MainActivity.kt" "$NEW_KOTLIN_DIR/"
    replace_in_file "$NEW_KOTLIN_DIR/MainActivity.kt" "package com.example.starter_app" "package $PKG_ANDROID"
  fi
  # Clean up old dir if empty
  rmdir -p "$KOTLIN_OLD_DIR" 2>/dev/null || true
fi

# Summary & next steps --------------------------------------------------------
green "\nDone! New project created at: $OUT_DIR"
cat <<NEXT

Next steps:
1) Open: $OUT_DIR
2) Ensure Flutter SDK is set in android/local.properties (Flutter does this automatically on first run)
3) Get packages:
   cd $OUT_DIR/mobile_app && flutter pub get
4) Build & run:
   - APK (debug):   $OUT_DIR/scripts/build_apk.sh --debug
   - APK (release): $OUT_DIR/scripts/build_apk.sh --release --no-install --no-launch
   - AAB (release): $OUT_DIR/scripts/build_aab.sh
5) Rename remaining identifiers as desired and set up release signing when ready.

NEXT
