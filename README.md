# RadioBot

Sauber neu aufgebauter Musikbot mit einer gemeinsamen Weboberfläche für Discord und TeamSpeak 3.

## Enthalten

- Ersteinrichtung ohne Login-Zwang: zuerst Administrator-Benutzer anlegen, danach anmelden.
- Farblich markierter Setup-Assistent.
- Discord- und TeamSpeak-3-Instanzen im selben Dashboard.
- Instanzwechsel oben im Dashboard; Steuerbefehle gehen an die aktive Instanz.
- Play, Queue, Pause, Resume, Skip, Stop und Lautstärke.
- Playlists.
- Radio-Suche über Radio Browser.
- YouTube-Suche/Wiedergabe über yt-dlp + ffmpeg.
- Spotify-Suche mit Client-Credentials und Auflösung der Titel über die normale Mediensuche.
- UI-Baukasten per Drag & Drop mit persistierter Kachelreihenfolge.
- Ein einziger normaler `radiobot`-Dienstbenutzer; kein privilegierter Unix-Socket und keine Patch-Kette.
- CPU-/RAM-Limits über systemd.
- Reproduzierbarer Installer für Ubuntu mit `apt update`, `apt upgrade`, Node 24, Deno und yt-dlp.
- Reproduzierbarer CI-Smoke-Test und Ressourcenbenchmark.

## Installation

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-final.sh | sudo bash
```

Nach der Installation die angezeigte Adresse öffnen. Zuerst den Administrator erstellen, anschließend Discord/TS3/Spotify konfigurieren.

## Betrieb

```bash
sudo systemctl status radiobot
sudo journalctl -u radiobot -f
sudo bash /opt/radiobot/../update.sh
```
