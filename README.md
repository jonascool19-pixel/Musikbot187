# RadioBot 4

Sauberer Neubau für Musik, Radio und Voice-Ausgabe.

## Kernfunktionen
- Play/Pause/Resume/Stop/Skip, Lautstärke, Queue und Wiedergabemodus
- YouTube-Suche + Wiedergabe über yt-dlp/FFmpeg
- Radio Browser Suche + Streaming über dieselbe Queue
- Spotify Client-Credentials Suche mit anschließender Mediensuche
- Playlists erstellen, füllen, öffnen, starten und einzelne Titel löschen
- automatische Suche beim Tippen
- mehrere Discord- und TeamSpeak-3-Instanzen
- Discord Guild-/Voice-Channel-Auswahl und Prefix
- TS3 Host/Port/Channel/Nickname/Passwort
- Dashboard mit farbigen Themen, Icons, gesperrten Kernkacheln und Drag-&-Drop-Baukasten
- gespeicherte Dashboard-Reihenfolge
- CPU/RAM/Load/Netzwerk-Telemetrie
- frei wählbares Netzwerkinterface in den Einstellungen
- Ersteinrichtung, Login, Benutzer/Rollen, Diagnose
- eigener `radiobot`-Dienstbenutzer, systemd, CPU/RAM-Limits
- Node 24, Deno, yt-dlp, FFmpeg
- CI-Smoke-Tests und `benchmark.sh`

## Installation
```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-stable.sh | sudo bash
```

Danach `http://SERVER-IP:3000` öffnen.

Spotify wird über `/etc/radiobot/radiobot.env` konfiguriert. Die Dashboard-Kernkacheln sind standardmäßig geschützt; im Baukasten können zusätzliche, frei verschiebbare Kacheln angelegt werden.