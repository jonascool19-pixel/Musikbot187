#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl unzip ca-certificates
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
INSTALL_REF="5e025eca4a52f3344f87536900771c194bdc7902"
curl -fsSL "https://raw.githubusercontent.com/jonascool19-pixel/radiobot/${INSTALL_REF}/install.sh" -o "$TMP"
chmod +x "$TMP"
exec bash "$TMP"
