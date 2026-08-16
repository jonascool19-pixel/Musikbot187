#!/usr/bin/env bash
set -euo pipefail
APP=/opt/musikbot-187
DATA=/var/lib/musikbot-187
USER=musikbot187
REPO=https://github.com/jonascool19-pixel/radiobot.git
id "$USER" >/dev/null 2>&1 || useradd --system --home "$DATA" --create-home --shell /usr/sbin/nologin "$USER"
apt-get update
apt-get install -y ca-certificates curl git ffmpeg build-essential unzip
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
if ! command -v deno >/dev/null 2>&1; then
  curl -fsSL https://deno.land/install.sh -o /tmp/deno-install.sh
  printf 'Y\n' | DENO_INSTALL=/usr/local sh /tmp/deno-install.sh
  rm -f /tmp/deno-install.sh
  ln -sf /usr/local/bin/deno /usr/bin/deno || true
fi
if ! command -v yt-dlp >/dev/null 2>&1; then curl -L --fail https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp; chmod +x /usr/local/bin/yt-dlp; fi
rm -rf "$APP"
install -d -o "$USER" -g "$USER" "$APP" "$DATA" "$DATA/files" /etc/musikbot-187
git clone --depth 1 "$REPO" "$APP"
cd "$APP/backend"
npm install --no-audit --no-fund
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
for _ in $(seq 1 20); do curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break; sleep 1; done
PUBLIC_URL="${MUSIKBOT187_PUBLIC_URL:-}"
if [[ -z "$PUBLIC_URL" && -f /etc/cloudflared/config.yml ]]; then
  TUNNEL_HOST="$(awk '/^[[:space:]]*hostname:[[:space:]]*/ {print $2; exit}' /etc/cloudflared/config.yml || true)"
  [[ -n "$TUNNEL_HOST" ]] && PUBLIC_URL="https://${TUNNEL_HOST}"
fi
if [[ -z "$PUBLIC_URL" ]]; then
  SERVER_IP="$(hostname -I | awk '{print $1}')"
  [[ -z "$SERVER_IP" ]] && SERVER_IP="127.0.0.1"
  PUBLIC_URL="http://${SERVER_IP}:3000"
fi
printf '\n\033[1;35m╔════════════════════════════════════════════════════════════╗\033[0m\n'
printf '\033[1;35m║\033[0m  \033[1;37mMusikbot 187\033[0m — \033[1;32mInstallation erfolgreich\033[0m             \033[1;35m║\033[0m\n'
printf '\033[1;35m╠════════════════════════════════════════════════════════════╣\033[0m\n'
printf '\033[1;35m║\033[0m  \033[1;92mEinrichtungslink:\033[0m                                      \033[1;35m║\033[0m\n'
printf '\033[1;35m║\033[0m  \033[1;92m➜ %s\033[0m\n' "$PUBLIC_URL"
printf '\033[1;35m╠════════════════════════════════════════════════════════════╣\033[0m\n'
printf '\033[1;35m║\033[0m  \033[1;92mIm Browser öffnen und die Ersteinrichtung abschließen.\033[0m \033[1;35m║\033[0m\n'
printf '\033[1;35m╚════════════════════════════════════════════════════════════╝\033[0m\n\n'
