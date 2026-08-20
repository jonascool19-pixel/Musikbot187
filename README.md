# MusikBot187 3.0.0

Selbst gehosteter Musik-/Radiobot für Ubuntu 24.04 LXC/CT mit Web-Dashboard, Discord Voice, TeamSpeak 3, YouTube, Radio-Browser, Spotify-Suche, lokaler Musik, Queue, Playlists, Monitoring, Berechtigungen und gehärteten systemd-Diensten.

## Einmal installieren

```bash
sudo apt update && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-latest.sh | sudo bash
```

Der Installer installiert Node.js 22, FFmpeg und yt-dlp, legt den Service-Benutzer an, richtet `musikbot187.service` plus den privilegierten Control-Dienst ein und gibt einen einmaligen Setup-Link für den ersten Admin aus.

## Verzeichnisse

- `/opt/musikbot187` — Anwendung
- `/var/lib/musikbot187` — persistenter Zustand, verschlüsselte Secrets, Musikbibliothek
- `/run/musikbot187/control.sock` — enger Allowlist-Controlpfad

## Sicherheitsgrenzen

Passwörter werden mit scrypt und individuellen Salts gehasht. Discord-/TS3-Secrets werden AES-256-GCM-verschlüsselt gespeichert. Lokale Pfade sind kanonisch begrenzt, externe Media-Ziele werden gegen private/reservierte Netze geprüft, Uploads werden über Dateigröße, Whitelist und ffprobe validiert, und Systemaktionen laufen nicht im Hauptprozess mit Root-Rechten.

Die Server-API erzwingt Berechtigungen unabhängig von der Dashboard-Navigation. Login, Suche und Playback haben getrennte Rate-Limits.

## Audit

Vor dem Commit wurden Node- und Shell-Syntax, Sicherheitsregressionen sowie ein strukturierter 100-Pass-Audit ausgeführt. Die Ubuntu-24.04-CI wiederholt diese Prüfungen nach echter Dependency-Installation.
