#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh -o "$TMP"
chmod +x "$TMP"
exec bash "$TMP"
