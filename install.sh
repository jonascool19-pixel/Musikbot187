#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/radiobot
DATA_DIR=/var/lib/radiobot
REPO="https://github.com/jonascool19-pixel/radiobot.git"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$ROOT"
[[ $EUID -eq 0 ]] || { echo 'Bitte als root ausführen.' >&2; exit 1; }
grep -q '^ID=ubuntu$' /etc/os-release || { echo 'Unterstützt wird Ubuntu.' >&2; exit 1; }

echo -e '\033[1;36m[1/8] System aktualisieren…\033[0m'
apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl unzip ffmpeg build-essential python3 git openssl sudo

echo -e '\033[1;36m[2/8] Node.js 24 sicherstellen…\033[0m'
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0])>=24?0:1)'; then curl -fsSL https://deb.nodesource.com/setup_24.x | bash -; apt-get install -y nodejs; fi
node --version

echo -e '\033[1;36m[3/8] Deno und yt-dlp installieren…\033[0m'
install -d -m 0755 /usr/local/bin /usr/local/lib/deno
if ! command -v deno >/dev/null 2>&1; then
  DENO_VERSION="$(curl -fsSL https://dl.deno.land/release-latest.txt)"
  case "$(uname -m)" in
    x86_64) DENO_TARGET='x86_64-unknown-linux-gnu' ;;
    aarch64|arm64) DENO_TARGET='aarch64-unknown-linux-gnu' ;;
    *) echo "Nicht unterstützte CPU-Architektur für Deno: $(uname -m)" >&2; exit 1 ;;
  esac
  DENO_TMP="$(mktemp -d)"
  trap 'rm -rf "$DENO_TMP"' EXIT
  curl -fsSL "https://dl.deno.land/release/${DENO_VERSION}/deno-${DENO_TARGET}.zip" -o "$DENO_TMP/deno.zip"
  unzip -q -o "$DENO_TMP/deno.zip" -d /usr/local/lib/deno
  install -m 0755 /usr/local/lib/deno/deno /usr/local/bin/deno
  rm -rf "$DENO_TMP"
  trap - EXIT
fi
deno --version
if ! command -v yt-dlp >/dev/null 2>&1; then curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp; chmod 0755 /usr/local/bin/yt-dlp; fi
yt-dlp --version

echo -e '\033[1;36m[4/8] Anwendung installieren…\033[0m'
mkdir -p "$APP_DIR" "$DATA_DIR"
if [[ -f "$ROOT/backend/package.json" ]]; then
  rm -rf "$APP_DIR/backend" "$APP_DIR/frontend"
  cp -a "$ROOT/backend" "$APP_DIR/"
  cp -a "$ROOT/frontend" "$APP_DIR/"
else
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  git clone --depth 1 "$REPO" "$TMP/repo"
  SOURCE_ROOT="$TMP/repo"
  rm -rf "$APP_DIR/backend" "$APP_DIR/frontend"
  cp -a "$SOURCE_ROOT/backend" "$APP_DIR/"
  cp -a "$SOURCE_ROOT/frontend" "$APP_DIR/"
fi
getent group radiobot >/dev/null 2>&1 || groupadd --system radiobot
if id -u radiobot >/dev/null 2>&1; then usermod --gid radiobot radiobot; else useradd --system --home-dir "$DATA_DIR" --gid radiobot --shell /usr/sbin/nologin radiobot; fi
chown -R radiobot:radiobot "$APP_DIR" "$DATA_DIR"
chmod 0750 "$DATA_DIR"
if [[ -f "$DATA_DIR/config.json" ]]; then chown radiobot:radiobot "$DATA_DIR/config.json"; chmod 0600 "$DATA_DIR/config.json"; fi

# The web service may invoke only these exact system operations as root, without a password.
install -d -m 0755 /etc/sudoers.d
cat > /etc/sudoers.d/radiobot-web-system <<'EOF'
radiobot ALL=(root) NOPASSWD: /usr/bin/systemctl restart radiobot, /usr/bin/systemctl reboot, /usr/bin/systemctl poweroff
EOF
chmod 0440 /etc/sudoers.d/radiobot-web-system
visudo -cf /etc/sudoers.d/radiobot-web-system >/dev/null

if [[ -f "$SOURCE_ROOT/update.sh" ]]; then install -m 0755 "$SOURCE_ROOT/update.sh" /usr/local/sbin/radiobot-update; fi

echo -e '\033[1;36m[5/8] Backend bauen…\033[0m'
cd "$APP_DIR/backend"
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund

echo -e '\033[1;36m[6/8] systemd einrichten…\033[0m'
install -m 0644 "$SOURCE_ROOT/radiobot.service" /etc/systemd/system/radiobot.service
systemctl daemon-reload
systemctl enable radiobot.service
systemctl restart radiobot.service
sleep 2
if ! systemctl is-active --quiet radiobot.service; then systemctl --no-pager --full status radiobot.service || true; journalctl -u radiobot.service -n 100 --no-pager || true; exit 1; fi
# Verify the passwordless elevation path using the real radiobot account and a harmless bot restart.
runuser -u radiobot -- /usr/bin/sudo -n /usr/bin/systemctl restart radiobot
sleep 1
if ! systemctl is-active --quiet radiobot.service; then systemctl --no-pager --full status radiobot.service || true; journalctl -u radiobot.service -n 100 --no-pager || true; exit 1; fi

echo -e '\033[1;32m[7/8] Installation abgeschlossen.\033[0m'
IP=$(hostname -I | awk '{print $1}')
printf '\033[1;36mDashboard:\033[0m http://%s:3000\n' "$IP"
printf '\033[1;33mErsteinrichtung:\033[0m Browser öffnen → Administrator erstellen → anmelden → Discord/TS3 konfigurieren.\n'
printf '\033[1;32mService:\033[0m systemctl status radiobot\n'
printf '\033[1;36mUpdate:\033[0m sudo radiobot-update\n'

echo -e '\033[1;36m[8/8] Abschlussprüfung…\033[0m'
curl -fsS http://127.0.0.1:3000/api/setup/status >/dev/null
echo -e '\033[1;32mRadioBot läuft.\033[0m\n'
