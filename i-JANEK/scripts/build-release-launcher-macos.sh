#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SOURCE="$SCRIPT_DIR/release-launcher.m"
OUTPUT="$APP_ROOT/Nowa wersja.app/Contents/MacOS/Nowa wersja"
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/i-janek-launcher.XXXXXX")"

cleanup() {
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT

mkdir -p "$(dirname "$OUTPUT")"

xcrun clang -O2 -fobjc-arc -fmodules-cache-path="$BUILD_DIR/modules-arm64" \
  -target arm64-apple-macos12.0 -framework Cocoa "$SOURCE" -o "$BUILD_DIR/launcher-arm64"
xcrun clang -O2 -fobjc-arc -fmodules-cache-path="$BUILD_DIR/modules-x86_64" \
  -target x86_64-apple-macos12.0 -framework Cocoa "$SOURCE" -o "$BUILD_DIR/launcher-x86_64"
xcrun lipo -create "$BUILD_DIR/launcher-arm64" "$BUILD_DIR/launcher-x86_64" -output "$OUTPUT"
chmod +x "$OUTPUT"

echo "Gotowe: $OUTPUT"
