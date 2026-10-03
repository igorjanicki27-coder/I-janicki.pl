#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[ERROR] Ten skrypt jest przeznaczony do uruchamiania na macOS."
  exit 1
fi

BUILDER_EXTRA_ARGS=()
if ! command -v wine >/dev/null 2>&1 && ! command -v wine64 >/dev/null 2>&1; then
  echo "[WARN] Brak Wine. Powstanie niepodpisany instalator z poprawną ikoną i metadanymi aplikacji."
  BUILDER_EXTRA_ARGS+=("-c.win.signExecutable=false")
fi

if ! command -v mono >/dev/null 2>&1; then
  echo "[ERROR] Brak Mono. Do budowy NSIS na macOS zainstaluj Mono."
  echo "        Przykład: brew install mono"
  exit 1
fi

echo "[1/5] Konfiguracja wydania"
node scripts/validate-release-environment.mjs

echo "[2/5] Typecheck"
npm run typecheck

if [[ ! -f "$ROOT_DIR/resources/google-oauth-desktop.local.json" ]]; then
  echo "[ERROR] Brakuje resources/google-oauth-desktop.local.json. Instalator nie będzie miał wbudowanej konfiguracji Google OAuth."
  echo "        Dodaj plik do resources/ przed buildem."
  exit 1
fi

echo "[3/5] Prepare icons"
"$ROOT_DIR/scripts/prepare-icons.sh"

echo "[4/5] Build renderer/main"
node scripts/write-app-version.mjs
npx electron-vite build

echo "[5/5] Build Windows installer (.exe, NSIS)"
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --config electron-builder.private.yml --win nsis --x64 --publish never "${BUILDER_EXTRA_ARGS[@]}"

echo "\n[OK] Gotowe. Szukaj instalatora w katalogu:"
echo "  $ROOT_DIR/dist/i-JANEK-Setup-*.exe"
