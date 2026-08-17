# MusikBot187

Komplett neu aufgebauter Musik-, Radio-, Discord- und TeamSpeak-3-Bot.

## Funktionen

- YouTube: bis zu 20 Suchergebnisse
- Radio Browser: bis zu 18 Sender
- Spotify: bis zu 20 Tracks, Wiedergabe über YouTube
- direkte URLs, Radio-Streams und lokale Dateien
- Pause, Resume, Stop, Skip, Queue leeren, Queue-Eintrag entfernen
- Queue / Repeat / Shuffle und Lautstärke 0–100
- Playlists
- Discord Slash- und Prefix-Befehle
- mehrere Discord- und TS3-Instanzen
- Web-Dashboard, Benutzer/Rollen, Diagnosen, System-/Speicher-/Netzwerkansicht
- Bot-/Systemsteuerung

## One-Click-Installation

Auf einem Debian-/Ubuntu-Server:

```bash
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh | sudo bash
```

Danach `http://SERVER-IP:3000/` öffnen und beim ersten Start den Admin anlegen.

## Discord

Für Prefix-Befehle muss im Discord Developer Portal der **Message Content Intent** aktiviert werden. Slash Commands werden nach dem Bot-Login automatisch registriert.

## Spotify

Im Dashboard/API können Spotify Client ID und Client Secret hinterlegt werden. Spotify-Suchergebnisse werden zur Wiedergabe über die passende YouTube-Suche aufgelöst.

## Entwicklung

```bash
cd backend
npm install
npm start
```
