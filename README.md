# MusikBot187

Neuer Musikbot mit Web-Dashboard, YouTube-/Radio-/Spotify-Suche, Discord, TeamSpeak 3, Playlists und Systemverwaltung.

## Installation

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-stable.sh | sudo bash
```

Der Stable-Installer unterstützt Debian/Ubuntu mit `apt-get`, richtet Node.js 22, FFmpeg und die aktuelle `yt-dlp`-Linux-Binary ein, installiert den Bot und aktiviert den Systemdienst `musikbot187`.

Nach der Installation: `http://SERVER-IP:3000/`

Für Prefix-Befehle in Discord muss der **Message Content Intent** im Discord Developer Portal aktiviert sein.
