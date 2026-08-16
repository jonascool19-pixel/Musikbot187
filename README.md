# Musikbot 187

Komplett neu aufgebauter Musik-/Radio-Bot mit Web-Dashboard.

Enthalten: Discord- und TS3-Instanzen, Play/Pause/Resume/Stop/Skip, Queue, Lautstärke, YouTube/yt-dlp + FFmpeg, Radio Browser, Spotify Client-Credentials, Playlists, Live-Suche, farbige Dashboard-Kacheln mit Drag & Drop, obere Live-Leiste mit Uhrzeit/CPU/RAM/Netzwerk, Netzwerkinterface-Auswahl, Benutzer/Rollen, Diagnose, Systemsteuerung, systemd, Node 24, Deno und yt-dlp.

## Installation

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-stable.sh | sudo bash
```

Der Installer beantwortet die Deno-Frage automatisch mit `Y` und gibt nach der Installation einen farbig hervorgehobenen Einrichtungslink aus. Ein vorhandener cloudflared-Tunnel wird dafür bevorzugt verwendet.

## Discord-Steuerung

Das konfigurierte Prefix unterstützt u. a. `play`, `pause`, `resume`, `skip`, `stop`, `volume` und `queue`.
