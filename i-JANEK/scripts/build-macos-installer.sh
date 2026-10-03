#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[ERROR] Ten skrypt jest przeznaczony do uruchamiania na macOS."
  exit 1
fi

echo "[1/4] Typecheck"
npm run typecheck

if [[ ! -f "$ROOT_DIR/resources/google-oauth-desktop.local.json" ]]; then
  echo "[ERROR] Brakuje resources/google-oauth-desktop.local.json. Instalator nie będzie miał wbudowanej konfiguracji Google OAuth."
  echo "        Dodaj plik do resources/ przed buildem."
  exit 1
fi

echo "[2/4] Prepare icons"
"$ROOT_DIR/scripts/prepare-icons.sh"

echo "[3/4] Build renderer/main"
npx electron-vite build

echo "[4/4] Build macOS installer (.dmg) and updater payload (.zip)"
npx electron-builder --config electron-builder.private.yml --mac dmg zip --publish never

echo "\n[OK] Instalator dla użytkownika:"
echo "  $ROOT_DIR/dist/i-JANEK-*.dmg"
echo "[INFO] Plik .zip jest technicznym pakietem wymaganym przez auto-update macOS, a nie instalatorem dla użytkownika."
