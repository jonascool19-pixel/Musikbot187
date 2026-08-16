#!/usr/bin/env bash
set -euo pipefail
id radiobot >/dev/null 2>&1 || useradd --system --home /var/lib/radiobot --create-home --shell /usr/sbin/nologin radiobot
apt-get update
apt-get install -y curl ffmpeg
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
command -v yt-dlp >/dev/null || { curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp; chmod +x /usr/local/bin/yt-dlp; }
install -d -o radiobot -g radiobot /opt/radiobot /var/lib/radiobot
cp -r backend frontend deploy /opt/radiobot/
cd /opt/radiobot/backend
npm install
npm run build
chown -R radiobot:radiobot /opt/radiobot /var/lib/radiobot
install -m 0644 /opt/radiobot/deploy/radiobot.service /etc/systemd/system/radiobot.service
systemctl daemon-reload
systemctl enable --now radiobot
echo "RadioBot läuft auf Port 3000."