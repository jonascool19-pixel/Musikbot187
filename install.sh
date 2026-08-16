#!/usr/bin/env bash
set -euo pipefail
APP=/opt/musikbot-187
DATA=/var/lib/musikbot-187
USER=musikbot187
REPO=https://github.com/jonascool19-pixel/radiobot.git
id "$USER" >/dev/null 2>&1 || useradd --system --home "$DATA" --create-home --shell /usr/sbin/nologin "$USER"
apt-get update
apt-get install -y ca-certificates curl git ffmpeg build-essential
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
if ! command -v deno >/dev/null 2>&1; then curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh; ln -sf /usr/local/bin/deno /usr/bin/deno || true; fi
if ! command -v yt-dlp >/dev/null 2>&1; then curl -L --fail https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp; chmod +x /usr/local/bin/yt-dlp; fi
rm -rf "$APP"
install -d -o "$USER" -g "$USER" "$APP" "$DATA" "$DATA/files" /etc/musikbot-187
git clone --depth 1 "$REPO" "$APP"
cd "$APP/backend"
npm install
npm run build
cat >/etc/musikbot-187/musikbot.env <<ENV
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
ENV
chmod 600 /etc/musikbot-187/musikbot.env
chown -R "$USER:$USER" "$APP" "$DATA"
install -m 0644 "$APP/deploy/musikbot187.service" /etc/systemd/system/musikbot187.service
systemctl daemon-reload
systemctl enable --now musikbot187
systemctl --no-pager --full status musikbot187 || true
echo
echo "Musikbot 187 läuft auf Port 3000."
echo "Dashboard: http://SERVER-IP:3000"
