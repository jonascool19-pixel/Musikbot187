# MusikBot187 5.0.0

Vollständiger Neuaufbau eines selbst gehosteten Musik- und Radiobots für Ubuntu 24.04/Debian mit Web-Dashboard, YouTube, Radio-Browser, Spotify, lokalen Audiodateien, Queue, Playlists, Discord, TeamSpeak 3, Benutzerrechten, Monitoring und getrenntem privilegiertem Control-Dienst.

## Einmal-Installation

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-latest.sh | sudo bash
```

Der Installer gibt den Dashboard- und einmaligen Setup-Link aus. Zielpfade sind `/opt/musikbot187` und `/var/lib/musikbot187`; der Hauptdienst läuft als Benutzer `musikbot187`.

## Entwicklung

Node.js 22 oder neuer wird benötigt.

```bash
cd backend
npm ci
npm test
npm run test:first-run
npm run test:browser
```

## Architektur

`frontend` → Fastify-API → Store/Auth/Permissions → Player → yt-dlp/FFmpeg → Discord/TS3. Direkte Medienziele werden gegen private und reservierte Netze geprüft. Secrets werden mit AES-256-GCM verschlüsselt. Systemaktionen laufen ausschließlich über `/run/musikbot187/control.sock`.

Weitere Details und offene Umgebungsprüfungen stehen in [docs/deep-audit.md](docs/deep-audit.md).
