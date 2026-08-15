# RadioBot

RadioBot ist ein sauber neu aufgebauter Musikbot mit gemeinsamer Weboberfläche für Discord und TeamSpeak 3.

## Funktionen

- Ersteinrichtung: zuerst Administrator-Benutzer erstellen, danach anmelden.
- Farblich markierter Setup-Assistent.
- Discord- und TeamSpeak-3-Instanzen im selben Dashboard.
- Wechsel der aktiven Instanz im Dashboard.
- Play, Queue, Pause, Resume, Skip, Stop und Lautstärke.
- Playlists.
- Radio-Suche über Radio Browser.
- YouTube-Suche und Wiedergabe über yt-dlp + ffmpeg.
- Spotify-Suche mit Client-Credentials und anschließender Mediensuche.
- Drag-&-Drop-UI-Baukasten mit gespeicherter Kachelreihenfolge.
- Ein normaler `radiobot`-Dienstbenutzer; kein privilegierter Socket und keine Patch-Kette.
- systemd CPU-/RAM-Limits.
- Ubuntu-Installer mit `apt update`, `apt upgrade`, Node 24, Deno und yt-dlp.
- CI-Smoke-Test und Ressourcenbenchmarks.

## Installation

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-final.sh | sudo bash
```

Danach die angezeigte Dashboard-Adresse öffnen. Erst den Administrator anlegen, anmelden und anschließend Discord/TS3/Spotify konfigurieren.

## Betrieb

```bash
sudo systemctl status radiobot
sudo journalctl -u radiobot -f
sudo radiobot-update
```

Die Konfiguration liegt unter `/var/lib/radiobot/config.json` und wird bei einer Neuinstallation nicht überschrieben.
