#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[ERROR] Ten skrypt jest przeznaczony do uruchamiania na macOS."
  exit 1
fi

echo "[1/3] Typecheck"
npm run typecheck

if [[ ! -f "$ROOT_DIR/resources/google-oauth-desktop.local.json" ]]; then
  echo "[ERROR] Brakuje resources/google-oauth-desktop.local.json. Aplikacja nie będzie miała wbudowanej konfiguracji Google OAuth."
  echo "        Dodaj plik do resources/ przed buildem."
  exit 1
fi

echo "[2/4] Prepare icons"
"$ROOT_DIR/scripts/prepare-icons.sh"

echo "[3/4] Build renderer/main"
npx electron-vite build

echo "[4/4] Build macOS .app (mac target: dir)"
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --publish never

echo "\n[OK] Gotowe. Szukaj .app w katalogu:"
echo "  $ROOT_DIR/dist/mac*/i-JANEK.app"
