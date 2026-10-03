#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANNEL="${1:-latest}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[ERROR] Lokalny build aktualizacji jest przeznaczony dla macOS."
  exit 1
fi

if [[ ! "$CHANNEL" =~ ^(latest|beta|test)$ ]]; then
  echo "[ERROR] Kanał musi mieć wartość: latest, beta albo test."
  exit 1
fi

cd "$ROOT_DIR"

SIGNING_IDENTITY="i-JANEK Local Code Signing"

echo "[1/7] Certyfikat podpisu macOS"
node scripts/check-macos-signing.mjs

echo "[2/7] Konfiguracja wydania"
node scripts/validate-release-environment.mjs

echo "[3/7] Typecheck"
npm run typecheck

echo "[4/7] Ikony"
"$ROOT_DIR/scripts/prepare-icons.sh"

echo "[5/7] Build aplikacji"
node scripts/write-app-version.mjs
npx electron-vite build

echo "[6/7] Podpisany macOS DMG + ZIP aktualizacyjny"
CSC_NAME="$SIGNING_IDENTITY" npx electron-builder \
  --config electron-builder.yml \
  --mac dmg zip \
  --arm64 \
  --publish never \
  "-c.publish.channel=$CHANNEL"

node scripts/check-macos-signing.mjs --app="$ROOT_DIR/dist/mac-arm64/i-JANEK.app"

echo "[7/7] Windows NSIS + metadane aktualizacji"
WINDOWS_EXTRA_ARGS=()
if ! command -v wine >/dev/null 2>&1 && ! command -v wine64 >/dev/null 2>&1; then
  WINDOWS_EXTRA_ARGS+=("-c.win.signExecutable=false")
fi

CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder \
  --config electron-builder.yml \
  --win nsis \
  --x64 \
  --publish never \
  "-c.publish.channel=$CHANNEL" \
  "${WINDOWS_EXTRA_ARGS[@]}"

node scripts/sign-windows-update.mjs "$CHANNEL" "$(node -p "require('./package.json').version")" "$ROOT_DIR/dist/i-JANEK-Setup-$(node -p "require('./package.json').version").exe"

echo "[OK] Publiczne paczki aktualizacji są gotowe w $ROOT_DIR/dist."
