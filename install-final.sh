#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl unzip ca-certificates
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
INSTALL_REF="f330969a01fb0d70fc128c4a1432b2915e192c9c"
curl -fsSL "https://raw.githubusercontent.com/jonascool19-pixel/radiobot/${INSTALL_REF}/install.sh" -o "$TMP"
chmod +x "$TMP"
exec bash "$TMP"
