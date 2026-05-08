#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_ICON="$ROOT_DIR/icons/icon.png"
FALLBACK_ICON="$(cd "$ROOT_DIR/.." && pwd)/icons/icon.png"
ICON_SRC="${ICON_SRC:-$DEFAULT_ICON}"

if [[ ! -f "$ICON_SRC" && -f "$FALLBACK_ICON" ]]; then
  ICON_SRC="$FALLBACK_ICON"
fi

if [[ ! -f "$ICON_SRC" ]]; then
  echo "[ERROR] Nie znaleziono ikony źródłowej."
  echo "        Oczekiwano: $DEFAULT_ICON"
  echo "        (opcjonalny fallback): $FALLBACK_ICON"
  exit 1
fi

mkdir -p "$ROOT_DIR/build"

cp "$ICON_SRC" "$ROOT_DIR/build/icon.png"

/Library/Frameworks/Python.framework/Versions/3.14/bin/python3 - "$ICON_SRC" "$ROOT_DIR/build/icon.ico" "$ROOT_DIR/build/icon.icns" <<'PY'
from PIL import Image
import sys

src, ico_out, icns_out = sys.argv[1:4]
img = Image.open(src).convert('RGBA')
img.save(
    ico_out,
    format='ICO',
    sizes=[(16,16), (24,24), (32,32), (48,48), (64,64), (128,128), (256,256)]
)
img.save(icns_out, format='ICNS')
print(f"[OK] Wygenerowano: {ico_out}")
print(f"[OK] Wygenerowano: {icns_out}")
PY

echo "[OK] Ustawiono ikonę build/icon.png z: $ICON_SRC"
