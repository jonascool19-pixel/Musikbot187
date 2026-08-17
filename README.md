# MusikBot187

MusikBot187 ist ein selbst gehosteter Musik- und Radiobot mit Web-Dashboard sowie Discord- und TeamSpeak-3-Ausgabe. Der aktuelle Stand ist auf einen einfachen Betrieb auf Debian/Ubuntu und besonders auf **Ubuntu 24.04 in einem Proxmox-LXC-Container (CT)** ausgelegt.

## Was der Bot aktuell kann

### Audio und Quellen

- YouTube-Suche mit bis zu 20 Ergebnissen
- Radio-Browser-Suche mit bis zu 18 Sendern
- Spotify-Suche mit bis zu 20 Tracks
- unterstützte direkte HTTP(S)-Quellen und Radio-Streams
- lokale Audiodateien innerhalb des vorgesehenen Musik-Datenverzeichnisses
- FFmpeg-/PCM-Audiokette
- Play, Pause, Resume, Stop und Skip
- Queue verwalten und einzelne Einträge entfernen
- Repeat- und Shuffle-Modus
- Lautstärke 0–100 %
- Schutz der Audio-API vor beliebigen lokalen Pfaden und unsicheren Zieladressen

### Playlists

- Playlists erstellen und verwalten
- Titel hinzufügen und entfernen
- Playlists abspielen

### Discord

- Slash Commands
- optionale Prefix Commands
- mehrere Discord-Instanzen
- konfigurierte Guild-/Voice-Channel-Zuordnung
- Befehle werden auf die konfigurierte Guild-Umgebung begrenzt
- privilegierter Message-Content-Intent wird nur benötigt, wenn Prefix Commands aktiviert sind

### TeamSpeak 3

- mehrere TS3-Instanzen
- Audioausgabe über TeamSpeak 3
- TS3-Fehlerlogging und Verbindungsdiagnose

### Web-Dashboard

- Player-Steuerung
- Queue-Verwaltung
- Playlist-Bereich
- Verbindungs- und Instanzverwaltung
- System-, Netzwerk-, Speicher- und Dateiinformationen
- Diagnose- und Systemsteuerung
- Admin-Bereich
- Benutzer, Rollen, Login und Sessions
- geschützter Setup-Bereich
- Login-Rate-Limit
- sichere Benutzer-/Service-Rollen für den Betrieb

## Installation und Betrieb

Der Stable-Installer ist für Debian/Ubuntu mit `apt-get` ausgelegt und automatisiert die Einrichtung der benötigten Laufzeit:

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-stable.sh | sudo bash
```

Der Installer richtet unter anderem ein:

- Node.js 22
- FFmpeg
- aktuelle `yt-dlp`-Linux-Binary
- MusikBot187 unter `/opt/musikbot187`
- eigenen Systemdienst-Benutzer statt dauerhaftem Root-Betrieb
- systemd-Service `musikbot187`
- notwendige Dienst-/sudo-Konfiguration
- automatisierten Start des Bots

Nach der Installation ist das Dashboard unter folgender Adresse erreichbar:

```text
http://SERVER-IP:3000/
```

## Zielplattform

Primäre Zielplattform:

- Proxmox VE
- Ubuntu 24.04 LXC/CT
- systemd-basierter Betrieb
- Debian/Ubuntu-Systeme mit `apt-get`

Der Installer und die CI-Teststrecke prüfen den Betrieb in einer isolierten Ubuntu-24.04-systemd-Umgebung sowie einen CT-nahen Preflight.

## Sicherheit und Robustheit

Der aktuelle Stand enthält unter anderem:

- geschützten Setup-Zugriff
- rollenbasierte Admin-Prüfung
- Login-Rate-Limit pro Client und Benutzer
- separaten systemd-Service-User
- begrenzte sudo-Regel
- Validierung von Audioquellen
- Schutz lokaler Audiopfade
- Schutz vor privaten/unsicheren Netzwerkzielen bei direkten Audioquellen
- Guild-Begrenzung für Discord-Befehle
- Audio-Race-Schutz bei Wechsel/Skip
- korrigierte CPU-Auslastungsberechnung
- saubere Setup-Übernahme
- TS3-Fehlerlogging

## Teststatus

Der aktuelle `main`-Stand wurde zuletzt mit der vollständigen CI-Kette geprüft:

- Backend-Regressionstests
- Playwright-/Chromium-Browser-Test
- Bash- und JavaScript-Syntaxprüfungen
- Installer-Security-Prüfungen
- Ubuntu-24.04-systemd-Testimage
- echter Installerlauf in isolierter Ubuntu-24.04-Umgebung
- Ubuntu-24.04-CT-Style-Preflight

Der zuletzt geprüfte CI-Lauf **#866** ist vollständig erfolgreich durchgelaufen.

**Hinweis:** Ein grüner CI-Lauf bedeutet, dass die automatisierten Prüfungen bestanden wurden; er ist kein mathematischer Beweis dafür, dass niemals ein weiterer Fehler existiert. Deshalb wird der aktuelle Stand weiterhin durch Tiefenaudits und zusätzliche Regressionstests überprüft.
