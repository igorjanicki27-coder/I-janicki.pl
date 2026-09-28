#!/usr/bin/env bash

set -euo pipefail

VERSION="${1:-}"
NOTES="${2:-}"
MODE="${3:-}"

usage() {
  cat <<'EOF'
Użycie: ./release.sh WERSJA "Opis zmian" [--dry-run]

Przykłady:
  ./release.sh 0.1.2 "Poprawki logowania i aktualizacji"
  ./release.sh 0.2.0-beta.1 "Wersja beta nowego panelu"
  ./release.sh 0.2.0-alpha.1 "Wersja testowa" --dry-run

Kanał jest wybierany automatycznie:
  x.y.z          -> stable
  x.y.z-beta.N   -> beta
  x.y.z-alpha.N  -> test
EOF
}

if [[ -z "$VERSION" || -z "$NOTES" ]]; then
  usage
  exit 1
fi

if [[ -n "$MODE" && "$MODE" != "--dry-run" ]]; then
  echo "[release] Nieznana opcja: $MODE" >&2
  usage
  exit 1
fi

if [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-alpha\.[0-9]+$ ]]; then
  CHANNEL="test"
elif [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-beta\.[0-9]+$ ]]; then
  CHANNEL="beta"
elif [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  CHANNEL="stable"
else
  echo "[release] Nieprawidłowa wersja: $VERSION" >&2
  usage
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ARGS=("$CHANNEL" "--version=$VERSION" "--notes=$NOTES")
if [[ "$MODE" == "--dry-run" ]]; then
  ARGS+=("--dry-run")
fi

echo "[release] i-JANEK $VERSION ($CHANNEL)"
echo "[release] Opis: $NOTES"
node scripts/release-channel.mjs "${ARGS[@]}"
