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

echo "[1/3] Typecheck"
npm run typecheck

if [[ ! -f "$ROOT_DIR/resources/google-oauth-desktop.local.json" ]]; then
  echo "[ERROR] Brakuje resources/google-oauth-desktop.local.json. Instalator nie będzie miał wbudowanej konfiguracji Google OAuth."
  echo "        Dodaj plik do resources/ przed buildem."
  exit 1
fi

if [[ ! -f "$ROOT_DIR/resources/rustdesk-config.local.txt" ]]; then
  echo "[ERROR] Brakuje resources/rustdesk-config.local.txt. Prywatny instalator wdrożeniowy nie skonfiguruje RustDesk."
  echo "        Dodaj plik do resources/ przed buildem."
  exit 1
fi

echo "[2/4] Prepare icons"
"$ROOT_DIR/scripts/prepare-icons.sh"

echo "[3/4] Build renderer/main"
npx electron-vite build

echo "[4/4] Build Windows installer (.exe, NSIS)"
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --config electron-builder.private.yml --win nsis --x64 --publish never "${BUILDER_EXTRA_ARGS[@]}"

echo "\n[OK] Gotowe. Szukaj instalatora w katalogu:"
echo "  $ROOT_DIR/dist/i-JANEK-Setup-*.exe"
