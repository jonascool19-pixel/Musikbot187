#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git ffmpeg ca-certificates build-essential
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
if ! command -v deno >/dev/null 2>&1; then curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh; fi
if ! command -v yt-dlp >/dev/null 2>&1; then curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp; chmod 755 /usr/local/bin/yt-dlp; fi
id radiobot >/dev/null 2>&1 || useradd --system --home /var/lib/radiobot --create-home --shell /usr/sbin/nologin radiobot
rm -rf /opt/radiobot && install -d -o radiobot -g radiobot /opt/radiobot /var/lib/radiobot
cp -a backend frontend deploy benchmark.sh README.md /opt/radiobot/
cd /opt/radiobot/backend
npm install
npm run build
chown -R radiobot:radiobot /opt/radiobot /var/lib/radiobot
install -m 0644 /opt/radiobot/deploy/radiobot.service /etc/systemd/system/radiobot.service
systemctl daemon-reload
systemctl enable radiobot
systemctl restart radiobot || systemctl start radiobot
systemctl --no-pager --full status radiobot || true
echo "RadioBot 4 installiert: http://$(hostname -I | awk '{print $1}'):3000"