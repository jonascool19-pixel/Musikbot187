#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
REPO='https://github.com/jonascool19-pixel/radiobot.git'
PIN='48fdf5321f433e78db3c43e1aaea80ac8865232e'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git

git clone --depth 1 "$REPO" "$TMP/repo"
git -C "$TMP/repo" fetch --depth 1 origin "$PIN"
git -C "$TMP/repo" checkout --detach "$PIN"
exec bash "$TMP/repo/install.sh"
