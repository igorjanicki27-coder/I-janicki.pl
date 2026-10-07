#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[ERROR] Ten skrypt jest przeznaczony do uruchamiania na macOS."
  exit 1
fi

SIGNING_IDENTITY="i-JANEK Local Code Signing"

echo "[1/5] Certyfikat podpisu macOS"
node scripts/check-macos-signing.mjs

echo "[2/5] Typecheck"
npm run typecheck

echo "[3/5] Prepare icons"
"$ROOT_DIR/scripts/prepare-icons.sh"

echo "[4/5] Build renderer/main"
npx electron-vite build

echo "[5/5] Build macOS installer (.dmg) and updater payload (.zip)"
CSC_NAME="$SIGNING_IDENTITY" npx electron-builder --config electron-builder.private.yml --mac dmg zip --publish never
node scripts/check-macos-signing.mjs --app="$ROOT_DIR/dist/mac-arm64/i-JANEK.app"

echo "\n[OK] Instalator dla użytkownika:"
echo "  $ROOT_DIR/dist/i-JANEK-*.dmg"
echo "[INFO] Plik .zip jest technicznym pakietem wymaganym przez auto-update macOS, a nie instalatorem dla użytkownika."
