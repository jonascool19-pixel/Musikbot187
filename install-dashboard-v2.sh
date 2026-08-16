#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl python3
BASE="$(mktemp)"
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-dashboard-fix.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

python3 - <<'PY'
from pathlib import Path

# Backend search results: expose artwork for music/radio/Spotify.
p = Path('/opt/radiobot/backend/src/media.ts')
s = p.read_text()
s = s.replace("return (data.entries ?? []).map((e: any) => ({ id: e.id, title: e.title, url: e.url || `https://www.youtube.com/watch?v=${e.id}`, duration: e.duration ?? null, channel: e.channel ?? e.uploader ?? '' }));", "return (data.entries ?? []).map((e: any) => ({ id: e.id, title: e.title, url: e.url || `https://www.youtube.com/watch?v=${e.id}`, duration: e.duration ?? null, channel: e.channel ?? e.uploader ?? '', image: e.thumbnail || e.thumbnails?.[0]?.url || null }));")
s = s.replace("return rows.map(x => ({ id: x.stationuuid, name: x.name, url: x.url_resolved || x.url, codec: x.codec, bitrate: x.bitrate, country: x.country }));", "return rows.map(x => ({ id: x.stationuuid, name: x.name, url: x.url_resolved || x.url, codec: x.codec, bitrate: x.bitrate, country: x.country, image: x.favicon || null }));")
s = s.replace("return (data.tracks.items ?? []).map((t: any) => ({ id: t.id, title: t.name, artist: t.artists?.map((a: any) => a.name).join(', '), album: t.album?.name, url: t.external_urls?.spotify, search: `${t.name} ${t.artists?.[0]?.name ?? ''}` }));", "return (data.tracks.items ?? []).map((t: any) => ({ id: t.id, title: t.name, artist: t.artists?.map((a: any) => a.name).join(', '), album: t.album?.name, url: t.external_urls?.spotify, image: t.album?.images?.[0]?.url || null, search: `${t.name} ${t.artists?.[0]?.name ?? ''}` }));")
p.write_text(s)

# Frontend search: carry artwork/type to /api/play.
p = Path('/opt/radiobot/frontend/search-ui-fix.js')
s = p.read_text()
s = s.replace("return `<div class=\"result-row\" data-input=\"${escapeHtml(input)}\" data-title=\"${escapeHtml(title)}\"><div><b>${escapeHtml(title)}</b><span>${escapeHtml(meta)}</span></div><div class=\"result-actions\"><button type=\"button\" data-action=\"play\">▶</button><button type=\"button\" data-action=\"playlist\">＋</button></div></div>`;", "const image = item.image || ''; const mediaKind = kind === 'radio' ? 'radio' : 'music'; return `<div class=\"result-row\" data-input=\"${escapeHtml(input)}\" data-title=\"${escapeHtml(title)}\" data-image=\"${escapeHtml(image)}\" data-kind=\"${mediaKind}\"><div><b>${escapeHtml(title)}</b><span>${escapeHtml(meta)}</span></div><div class=\"result-actions\"><button type=\"button\" data-action=\"play\">▶</button><button type=\"button\" data-action=\"playlist\">＋</button></div></div>`;")
s = s.replace("await safeApi('/api/play', { method: 'POST', body: JSON.stringify({ input, playNow: true }) });", "await safeApi('/api/play', { method: 'POST', body: JSON.stringify({ input, playNow: true, image: row.dataset.image || null, kind: row.dataset.kind || 'music' }) });")
p.write_text(s)

# Rebuild and restart.
Path('/opt/radiobot/backend/src/media.ts').touch()
PY
cd /opt/radiobot/backend
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
systemctl restart radiobot
sleep 2
systemctl is-active --quiet radiobot
printf '\033[1;32mDashboard-v2 installiert.\033[0m\n'
