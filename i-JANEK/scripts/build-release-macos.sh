#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/build-macos-installer.sh"
"$ROOT_DIR/scripts/build-windows-exe-from-macos.sh"

echo "\n[OK] Instalatory macOS (.dmg) i Windows (.exe) oraz techniczne pliki auto-update zostały zbudowane."
