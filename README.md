# RadioBot Suite

Ein eigenständiger Discord-Radio-/Musikbot mit Weboberfläche.

## Enthalten
- Discord Voice-Verbindung
- Radio-Streams per URL
- lokale MP3/WAV/OGG-Dateien aus `data/music`
- Queue
- Play/Pause/Stop/Skip
- Lautstärke
- Radio-Verwaltung im Web-Dashboard
- Docker/Ubuntu 24.04

## Start mit Docker
```bash
cp .env.example .env
nano .env
# DISCORD_TOKEN setzen
mkdir -p data/music
docker compose up -d --build
```
Weboberfläche: `http://SERVER-IP:3000`

## Discord
Der Bot braucht mindestens `View Channel`, `Connect`, `Speak`, `Send Messages` sowie für Slash Commands die üblichen Bot-Rechte. Der Bot muss zum Start in einen Voice-Channel gehen können.

## LXC/CT
Docker in einem LXC benötigt auf Proxmox je nach Setup Nesting/Kernel-Optionen. Eine Ubuntu-24.04-VM ist am unkompliziertesten; der Container selbst ist für Ubuntu 24.04 ausgelegt.
