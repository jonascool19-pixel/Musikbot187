# MusikBot187

Komplett neu aufgebauter Musik- und Radiobot mit Web-Dashboard, Discord- und TeamSpeak-3-Ausgabe.

## Funktionen

- YouTube-Suche mit bis zu 20 Ergebnissen
- Radio-Browser-Suche mit bis zu 18 Sendern
- Spotify-Suche mit bis zu 20 Tracks
- direkte URLs, Radio-Streams und lokale Dateien
- Play, Pause, Resume, Stop und Skip
- Queue verwalten und einzelne Einträge entfernen
- Queue-, Repeat- und Shuffle-Modus
- Lautstärke 0–100 %
- Playlists erstellen, verwalten, Titel hinzufügen/entfernen und abspielen
- Discord Slash Commands und Prefix Commands
- mehrere Discord-Instanzen sowie Guild-/Voice-Channel-Auswahl
- TeamSpeak-3-Instanzen und Audioausgabe
- Web-Dashboard mit Player-, Playlist-, Verbindungs-, System- und Admin-Bereich
- Benutzer, Rollen, Login und Sessions
- Spotify-Konfiguration
- System-, Netzwerk-, Speicher- und Dateiinformationen
- Diagnose- und Systemsteuerung
- FFmpeg-/PCM-Audiokette

## Installation

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-stable.sh | sudo bash
```

Der Stable-Installer unterstützt Debian/Ubuntu mit `apt-get`, richtet Node.js 22, FFmpeg und die aktuelle `yt-dlp`-Linux-Binary ein, installiert MusikBot187 nach `/opt/musikbot187` und aktiviert den Systemdienst `musikbot187`.

Nach der Installation:

```text
http://SERVER-IP:3000/
```

Für Prefix-Befehle in Discord muss der **Message Content Intent** im Discord Developer Portal aktiviert sein.

## Status

Der aktuelle `main`-Stand wird durch GitHub Actions auf Installation, Tests, Bash-Syntax sowie Backend- und Frontend-Syntax geprüft.
