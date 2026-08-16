#!/usr/bin/env bash
set -euo pipefail
apt-get update
apt-get install -y git
rm -rf /tmp/musikbot187-install
git clone --depth 1 https://github.com/jonascool19-pixel/radiobot.git /tmp/musikbot187-install
cd /tmp/musikbot187-install
exec bash ./install.sh
