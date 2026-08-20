# MusikBot187 4.0.0

Kompletter Neuaufbau für Ubuntu 24.04 LXC/CT. Der Code besteht nur aus dem neuen Kern; alte Fix-, Kompatibilitäts- und Frontend-Hilfsdateien sind nicht Bestandteil dieses Stands.

## Einmal installieren

```bash
sudo apt update && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-latest.sh | sudo bash
```

Der Installer nutzt kein Git im laufenden Installationsverzeichnis. Er lädt den `main`-Stand als Archiv, installiert Node.js 22, FFmpeg und yt-dlp, legt den Service-Benutzer an und startet genau `musikbot187.service`.

Nach dem Start wird ein einmaliger Setup-Link ausgegeben. Darüber wird der erste Admin angelegt. Danach stehen Dashboard, YouTube-Suche, Radio-Browser, Spotify-Suche, Queue, Playlists, lokale Musik, Discord Voice und TS3-Ausgabe zur Verfügung.

## Laufzeit

- Anwendung: `/opt/musikbot187`
- Daten/Musik: `/var/lib/musikbot187`
- Secrets: `/etc/musikbot187.env`
- Service: `musikbot187.service`

## Tests

CI läuft auf Ubuntu 24.04 und prüft Bash-Syntax, Node-Syntax, lokale Import/Export-Verträge sowie Sicherheits-/Pfadtests nach echter Dependency-Installation.
