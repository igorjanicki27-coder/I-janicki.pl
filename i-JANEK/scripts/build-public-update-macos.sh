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

echo "[1/6] Konfiguracja wydania"
node scripts/validate-release-environment.mjs

echo "[2/6] Typecheck"
npm run typecheck

echo "[3/6] Ikony"
"$ROOT_DIR/scripts/prepare-icons.sh"

echo "[4/6] Build aplikacji"
npx electron-vite build

echo "[5/6] Podpisany macOS DMG + ZIP aktualizacyjny"
npx electron-builder \
  --config electron-builder.yml \
  --mac dmg zip \
  --arm64 \
  --publish never \
  "-c.publish.channel=$CHANNEL"

codesign --verify --deep --strict "$ROOT_DIR/dist/mac-arm64/i-JANEK.app"

echo "[6/6] Windows NSIS + metadane aktualizacji"
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

echo "[OK] Publiczne paczki aktualizacji są gotowe w $ROOT_DIR/dist."
