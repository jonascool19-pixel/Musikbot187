#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/jonascool19-pixel/radiobot.git"
WORKDIR="/tmp/radiobot-install"

rm -rf "$WORKDIR"
git clone --depth 1 "$REPO" "$WORKDIR"
cd "$WORKDIR"

exec bash ./install.sh
