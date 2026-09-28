#!/usr/bin/env bash

set -euo pipefail

BASE_VERSION="${1:-}"
NOTES="${2:-}"
MODE="${3:-}"

usage() {
  cat <<'EOF'
Użycie: ./release.sh WERSJA_BAZOWA "Opis zmian" [--dry-run]

Przykłady:
  ./release.sh 0.1.2 "Poprawki logowania i aktualizacji"
  ./release.sh 0.2.0 "Nowy panel" --dry-run

Skrypt zapyta, czy przygotować wydanie stable, test czy beta.
Końcówkę -alpha.N lub -beta.N oraz jej kolejny numer doda automatycznie.
EOF
}

if [[ -z "$BASE_VERSION" || -z "$NOTES" ]]; then
  usage
  exit 1
fi

if [[ -n "$MODE" && "$MODE" != "--dry-run" ]]; then
  echo "[release] Nieznana opcja: $MODE" >&2
  usage
  exit 1
fi

if [[ ! "$BASE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "[release] Nieprawidłowa wersja bazowa: $BASE_VERSION. Podaj tylko x.y.z, np. 0.2.0." >&2
  usage
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Wybierz rodzaj wydania:"
echo "  1) stable — dla wszystkich klientów"
echo "  2) test   — testy wewnętrzne"
echo "  3) beta   — dla grupy beta"
read -r -p "Twój wybór [1-3]: " CHANNEL_CHOICE

next_sequence() {
  local suffix="$1"
  local highest=0
  local tag
  local sequence

  while IFS= read -r tag; do
    sequence="${tag##*.}"
    if [[ "$sequence" =~ ^[0-9]+$ ]] && (( sequence > highest )); then
      highest="$sequence"
    fi
  done < <(git tag --list "i-janek-v${BASE_VERSION}-${suffix}.*")

  echo $((highest + 1))
}

case "$CHANNEL_CHOICE" in
  1 | stable | Stable)
    CHANNEL="stable"
    VERSION="$BASE_VERSION"
    ;;
  2 | test | Test)
    CHANNEL="test"
    VERSION="${BASE_VERSION}-alpha.$(next_sequence alpha)"
    ;;
  3 | beta | Beta)
    CHANNEL="beta"
    VERSION="${BASE_VERSION}-beta.$(next_sequence beta)"
    ;;
  *)
    echo "[release] Nieprawidłowy wybór. Wpisz 1, 2 albo 3." >&2
    exit 1
    ;;
esac

ARGS=("$CHANNEL" "--version=$VERSION" "--notes=$NOTES")
if [[ "$MODE" == "--dry-run" ]]; then
  ARGS+=("--dry-run")
fi

echo "[release] i-JANEK $VERSION ($CHANNEL)"
echo "[release] Opis: $NOTES"
node scripts/release-channel.mjs "${ARGS[@]}"
