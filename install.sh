#!/usr/bin/env bash
set -euo pipefail
APP=/opt/musikbot-187; DATA=/var/lib/musikbot-187; USER=musikbot187; REPO=https://github.com/jonascool19-pixel/radiobot.git
id "$USER" >/dev/null 2>&1 || useradd --system --home "$DATA" --create-home --shell /usr/sbin/nologin "$USER"
apt-get update
apt-get install -y ca-certificates curl git ffmpeg build-essential unzip sudo
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
if ! command -v deno >/dev/null 2>&1; then curl -fsSL https://deno.land/install.sh -o /tmp/deno-install.sh; printf 'Y\n' | DENO_INSTALL=/usr/local sh /tmp/deno-install.sh; rm -f /tmp/deno-install.sh; ln -sf /usr/local/bin/deno /usr/bin/deno || true; fi
if ! command -v yt-dlp >/dev/null 2>&1; then curl -L --fail https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp; chmod +x /usr/local/bin/yt-dlp; fi
systemctl stop musikbot187 2>/dev/null || true
rm -rf "$APP"
install -d -o "$USER" -g "$USER" "$APP" "$DATA" "$DATA/files" /etc/musikbot-187
rm -rf /tmp/mb187-src && git clone --depth 1 "$REPO" /tmp/mb187-src && cp -a /tmp/mb187-src/. "$APP/"
chown -R "$USER:$USER" "$APP" "$DATA"
cd "$APP/backend"; npm install; npm run build
install -m 0750 -o root -g root "$APP/deploy/musikbot187-control" /usr/local/sbin/musikbot187-control
cat >/etc/sudoers.d/musikbot187 <<EOF
$USER ALL=(root) NOPASSWD: /usr/local/sbin/musikbot187-control
EOF
chmod 0440 /etc/sudoers.d/musikbot187
install -m 0644 "$APP/deploy/musikbot187.service" /etc/systemd/system/musikbot187.service
cat >/etc/musikbot-187/musikbot.env <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
EOF
chmod 600 /etc/musikbot-187/musikbot.env
systemctl daemon-reload; systemctl enable musikbot187; systemctl restart musikbot187
for _ in $(seq 1 20); do curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break; sleep 1; done
PUBLIC_URL="${MUSIKBOT187_PUBLIC_URL:-}"
if [[ -z "$PUBLIC_URL" && -f /etc/cloudflared/config.yml ]]; then H="$(awk '/^[[:space:]]*hostname:[[:space:]]*/ {print $2; exit}' /etc/cloudflared/config.yml || true)"; [[ -n "$H" ]] && PUBLIC_URL="https://$H"; fi
[[ -z "$PUBLIC_URL" ]] && PUBLIC_URL="http://$(hostname -I | awk '{print $1}'):3000"
printf '\n\033[1;36m==============================================\033[0m\n\033[1;36m       MUSIKBOT 187 INSTALLATION FERTIG       \033[0m\n\033[1;32m       Einrichtungslink: %s\033[0m\n\033[1;36m==============================================\033[0m\n\n' "$PUBLIC_URL"
