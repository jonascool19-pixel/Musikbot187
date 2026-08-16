#!/usr/bin/env bash
set -euo pipefail
REPO="https://github.com/jonascool19-pixel/radiobot.git"
WORKDIR=/tmp/radiobot-install
apt-get update >/dev/null && apt-get install -y git >/dev/null
rm -rf "$WORKDIR"
git clone --depth 1 "$REPO" "$WORKDIR" >/dev/null
cd "$WORKDIR"
exec bash ./install.sh