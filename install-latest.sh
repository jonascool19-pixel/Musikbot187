#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'Bitte mit sudo bash ausführen.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
APP=/opt/musikbot187
DATA=/var/lib/musikbot187
REPO=jonascool19-pixel/Musikbot187
REPO_NAME=${REPO##*/}
VERSION=main
OLD="${APP}.previous"
ROLLOUT_STARTED=0
rollback_on_error(){
  local line="$1"
  trap - ERR
  echo "FEHLER: Installation in Zeile $line abgebrochen." >&2
  if [[ "$ROLLOUT_STARTED" -eq 1 ]]; then
    echo 'Vorherige funktionierende MusikBot-Version wird automatisch wiederhergestellt.' >&2
    systemctl stop musikbot187.service musikbot187-control.service 2>/dev/null || true
    if [[ -d "$OLD" ]]; then rm -rf "$APP"; mv "$OLD" "$APP"; fi
    if [[ -d "$APP" ]]; then
      install -m 0644 "$APP/systemd/musikbot187.service" /etc/systemd/system/musikbot187.service
      install -m 0644 "$APP/systemd/musikbot187-control.service" /etc/systemd/system/musikbot187-control.service
      systemctl daemon-reload
      systemctl enable --now musikbot187-control.service musikbot187.service
      echo 'Rollback abgeschlossen: Die vorherige Version läuft wieder.' >&2
    fi
  elif [[ "$ROLLOUT_STARTED" -eq 2 ]]; then
    systemctl disable --now musikbot187.service musikbot187-control.service 2>/dev/null || true
    rm -rf "$APP"
    rm -f /etc/systemd/system/musikbot187.service /etc/systemd/system/musikbot187-control.service
    systemctl daemon-reload
    echo 'Unvollständige Erstinstallation wurde sauber entfernt; die Nutzerdaten blieben erhalten.' >&2
  fi
  exit 1
}
trap 'rollback_on_error "$LINENO"' ERR
apt-get update
apt-get install -y ca-certificates curl ffmpeg openssl xz-utils build-essential python3 pkg-config libopus-dev
if ! command -v node >/dev/null || [[ $(node --version | tr -d v | cut -d. -f1) -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
YT_BASE=https://github.com/yt-dlp/yt-dlp/releases/latest/download
curl --retry 3 --retry-all-errors -fsSL "$YT_BASE/yt-dlp" -o /usr/local/bin/yt-dlp.new
curl --retry 3 --retry-all-errors -fsSL "$YT_BASE/SHA2-256SUMS" -o /tmp/yt-dlp.sha256
EXPECTED="$(awk '$2=="yt-dlp" || $2=="*yt-dlp" {print $1; exit}' /tmp/yt-dlp.sha256)"
ACTUAL="$(sha256sum /usr/local/bin/yt-dlp.new | awk '{print $1}')"
[[ -n "$EXPECTED" && "$EXPECTED" == "$ACTUAL" ]] || { echo 'yt-dlp SHA-256-Prüfung fehlgeschlagen.' >&2; exit 1; }
install -m 0755 /usr/local/bin/yt-dlp.new /usr/local/bin/yt-dlp
rm -f /usr/local/bin/yt-dlp.new /tmp/yt-dlp.sha256
getent group musikbot187 >/dev/null || groupadd --system musikbot187
id musikbot187 >/dev/null 2>&1 || useradd --system --gid musikbot187 --home-dir "$DATA" --shell /usr/sbin/nologin musikbot187
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl --retry 3 --retry-all-errors --proto '=https' -fsSL "https://github.com/$REPO/archive/refs/heads/$VERSION.tar.gz" -o "$TMP/app.tar.gz"
tar -xzf "$TMP/app.tar.gz" -C "$TMP"
SOURCE="$TMP/$REPO_NAME-$VERSION"
[[ -d "$SOURCE/backend" && -f "$SOURCE/backend/package-lock.json" ]] || { echo 'Das geladene MusikBot-Archiv ist unvollständig.' >&2; exit 1; }
# Abhängigkeiten vor dem Umschalten vorbereiten. So läuft eine vorhandene
# Installation während des längsten Update-Schritts ohne Unterbrechung weiter.
cd "$SOURCE/backend"; npm ci --omit=dev --no-audit --no-fund
systemctl stop musikbot187.service musikbot187-control.service 2>/dev/null || true
rm -rf "$OLD"
if [[ -d "$APP" ]]; then ROLLOUT_STARTED=1; mv "$APP" "$OLD"; else ROLLOUT_STARTED=2; fi
install -d -m 0755 "$APP"; cp -a "$SOURCE/." "$APP/"
install -d -o musikbot187 -g musikbot187 -m 0750 "$DATA" "$DATA/music"
SETUP="$(openssl rand -hex 32)"
if [[ -f /etc/musikbot187.env ]]; then SETUP="$(sed -n 's/^MUSIKBOT187_SETUP_TOKEN=//p' /etc/musikbot187.env | head -1)"; fi
cat > /etc/musikbot187.env <<EOF
MUSIKBOT187_DATA_DIR=$DATA
MUSIKBOT187_FRONTEND_DIR=$APP/frontend
MUSIKBOT187_SETUP_TOKEN=$SETUP
MUSIKBOT187_HOST=0.0.0.0
MUSIKBOT187_PORT=3000
EOF
chmod 0600 /etc/musikbot187.env
chown -R root:root "$APP"; chown -R musikbot187:musikbot187 "$DATA"
install -m 0644 "$APP/systemd/musikbot187.service" /etc/systemd/system/musikbot187.service
install -m 0644 "$APP/systemd/musikbot187-control.service" /etc/systemd/system/musikbot187-control.service
usermod -a -G musikbot187 root
systemctl daemon-reload
systemctl enable --now musikbot187-control.service musikbot187.service
sleep 3
curl -fsS http://127.0.0.1:3000/api/health >/dev/null || { journalctl -u musikbot187 -n 100 --no-pager; exit 1; }
rm -rf "$OLD"
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; [[ -n "$IP" ]] || IP=SERVER-IP
echo "Dashboard: http://$IP:3000/"
echo "Einrichtungslink: http://$IP:3000/#setup=$SETUP"
