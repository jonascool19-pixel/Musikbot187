#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/radiobot}"
REPO="https://github.com/jonascool19-pixel/radiobot.git"
command -v docker >/dev/null 2>&1 || { echo 'Docker fehlt. Installiere Docker zuerst.'; exit 1; }
if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$(dirname "$APP_DIR")"
  sudo git clone "$REPO" "$APP_DIR"
else
  cd "$APP_DIR"
  sudo git pull --ff-only
fi
cd "$APP_DIR"
sudo mkdir -p data/music data/uploads
if [ ! -f .env ]; then sudo cp .env.example .env; echo; echo "Jetzt DISCORD_TOKEN in $APP_DIR/.env eintragen."; fi
sudo docker compose up -d --build
echo
echo "RadioBot läuft. Dashboard: http://$(hostname -I | awk '{print $1}'):3000"
