# MusikBot187

MusikBot187 ist ein selbst gehosteter Musik- und Radiobot mit Web-Dashboard sowie Discord- und TeamSpeak-3-Ausgabe. Der aktuelle Stand ist auf einen einfachen Betrieb auf Debian/Ubuntu und besonders auf **Ubuntu 24.04 in einem Proxmox-LXC-Container (CT)** ausgelegt.

## Was der Bot aktuell kann

### Audio und Quellen

- YouTube-Suche mit bis zu 20 Ergebnissen
- Radio-Browser-Suche mit bis zu 18 Sendern
- Spotify-Suche mit bis zu 20 Tracks
- unterstützte direkte HTTP(S)-Quellen und Radio-Streams
- lokale Audiodateien innerhalb des vorgesehenen Musik-Datenverzeichnisses
- Browser-Upload eigener Musikdateien
- eigene Musikbibliothek direkt im Dashboard
- FFmpeg-/PCM-Audiokette
- Play, Pause, Resume, Stop und Skip
- Queue verwalten und einzelne Einträge entfernen
- Repeat- und Shuffle-Modus
- Lautstärke 0–100 %
- Schutz der Audio-API vor beliebigen lokalen Pfaden und unsicheren Zieladressen

### Playlists

- Playlists erstellen und verwalten
- Titel hinzufügen und entfernen
- Suchergebnisse, Radiosender und hochgeladene Musik direkt per **＋ Playlist** hinzufügen
- Playlists abspielen

### Discord

- Slash Commands
- optionale Prefix Commands mit expliziter Message-Content-Intent-Freigabe
- mehrere Discord-Instanzen
- Bot-ID/Client-ID-Verwaltung
- Bot direkt zu Discord hinzufügen
- Einladungslink erzeugen und kopieren
- konfigurierten Discord-Server auswählen und aktualisieren
- Voice-Kanal auswählen und aktualisieren
- Verbinden, neu verbinden, trennen und entfernen
- sichtbarer Online-/Offline-Status pro Instanz
- konfigurierte Guild-/Voice-Channel-Zuordnung
- Befehle werden auf die konfigurierte Guild-Umgebung begrenzt

### TeamSpeak 3

- mehrere TS3-Instanzen
- Audioausgabe über TeamSpeak 3
- TS3-Fehlerlogging und Verbindungsdiagnose

### Web-Dashboard

- Player-Steuerung
- Queue-Verwaltung
- Playlist-Bereich
- eigene Musikbibliothek als Seitenleisten-Bereich
- Musikdateien per Browser auswählen und hochladen
- hochgeladene Musik abspielen, in Playlists übernehmen und entfernen
- Verbindungs- und Instanzverwaltung
- Dashboard-Live-Monitoring für CPU, RAM und Netzwerk-Auslastung
- RX-/TX-Auslastung als Prozentwerte im Kopfbereich
- Auswahl der aktiven Discord-/TS3-Ausgabeinstanz direkt im Dashboard
- Bot Start/Stop im Kopfbereich
- administrativer Ubuntu-Neustart und Shutdown im Kopfbereich
- System-Live-Monitoring für CPU, RAM, RX/TX und Gesamtverkehr
- Live-Aktualisierung der Monitoring-Werte im 1-Sekunden-Takt
- System-, Netzwerk-, Speicher- und Dateiinformationen
- Diagnosebereich
- Admin-Bereich
- Benutzer, Rollen, Login und Sessions
- geschützter Setup-Bereich
- Login-Rate-Limit
- sichere Benutzer-/Service-Rollen für den Betrieb

## Installation und Betrieb

Der Stable-Installer ist für Debian/Ubuntu mit `apt-get` ausgelegt. Für den von dir gewünschten Schnellstart wird vor der eigentlichen MusikBot187-Installation das System aktualisiert und `curl` installiert. Voraussetzung ist ein systemd-basiertes Debian/Ubuntu-System; für Proxmox wird ein **Ubuntu-24.04-LXC/CT mit systemd und verfügbaren cgroups** verwendet.

### Offizieller Installations-Einzeiler

Auf dem frisch erstellten Container als Root oder mit einem Benutzer mit `sudo`-Rechten:

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-stable.sh | sudo bash
```

Dieser Einzeiler ist der bevorzugte aktuelle Installationsweg. Der eigentliche Stable-Installer richtet unter anderem ein:

- Node.js 22
- FFmpeg
- aktuelle `yt-dlp`-Linux-Binary
- MusikBot187 unter `/opt/musikbot187`
- Daten und Musikverzeichnis unter `/var/lib/musikbot187`
- eigenen Systemdienst-Benutzer statt dauerhaftem Root-Betrieb
- systemd-Service `musikbot187`
- restriktive systemd-Sandbox
- begrenzte sudo-Regel für Bot-Start/Stop/Restart sowie explizit die beiden Ubuntu-Power-Aktionen
- automatisierten Start des Bots

Nach erfolgreicher Installation zeigt der Installer die Dashboard-Adresse und einen **einmaligen Einrichtungslink mit Installer-Token** an. Der Einrichtungslink wird nur für die Ersteinrichtung benötigt.

Das Dashboard ist danach unter folgender Adresse erreichbar:

```text
http://SERVER-IP:3000/
```

### Nach der Installation

1. Den vom Installer ausgegebenen Einrichtungslink im Browser öffnen.
2. Den ersten Admin-Benutzer anlegen.
3. Im Dashboard unter **Verbindungen → Discord** eine Discord-Instanz konfigurieren.
4. Bot hinzufügen, Server und Voice-Kanal auswählen und die Instanz speichern/verbinden.
5. Falls Prefix Commands benötigt werden, Message Content Intent für die Discord-App ausdrücklich freigeben und die entsprechende Intent-Konfiguration verwenden.
6. Unter **Musik** eigene Audiodateien direkt aus dem Browser hochladen und anschließend abspielen oder einer Playlist hinzufügen.
7. Anschließend Player, Netzwerk-Monitoring und Systemdaten testen.

## Zielplattform

Primäre Zielplattform:

- Proxmox VE
- Ubuntu 24.04 LXC/CT
- systemd-basierter Betrieb
- Debian/Ubuntu-Systeme mit `apt-get`

Der Installer und die CI-Teststrecke prüfen den Betrieb in einer isolierten Ubuntu-24.04-systemd-Umgebung sowie einen CT-nahen Preflight.

## Sicherheit und Robustheit

Der aktuelle Stand enthält unter anderem:

- geschützten Setup-Zugriff mit einmaligem Installer-Token
- rollenbasierte Admin-Prüfung
- Login-Rate-Limit pro Client und Benutzer
- automatisch bereinigten Session-/Rate-Limit-State
- individuelle zufällige Salt-Werte für Passwort-Hashes
- Migration älterer Passwort-Hashes beim erfolgreichen Login
- separaten systemd-Service-User
- restriktive systemd-Sandbox
- eng begrenzte sudo-Regel nur für definierte Bot-/Ubuntu-Control-Kommandos
- Validierung von Audioquellen
- Schutz lokaler Audiopfade inklusive Symlink-Prüfung
- Uploads ausschließlich in das konfigurierte Musikverzeichnis
- Whitelist für erlaubte Audio-Dateiendungen beim Upload
- Schutz vor privaten/unsicheren Netzwerkzielen bei direkten Audioquellen
- Guild-Begrenzung für Discord-Befehle
- Audio-Race-Schutz bei Wechsel/Skip
- korrigierte CPU-Auslastungsberechnung
- Netzwerkverkehrs-Monitoring mit RX/TX-Zählern und Auslastungsprozenten
- saubere Setup-Übernahme
- TS3-Fehlerlogging

## Teststatus

Der aktuelle `main`-Stand enthält die vollständige CI-Kette mit:

- Backend-Regressionstests
- Playwright-/Chromium-Browser-Test
- Bash- und JavaScript-Syntaxprüfungen
- Installer-Security-Prüfungen
- Ubuntu-24.04-systemd-Testimage
- echter Installerlauf in isolierter Ubuntu-24.04-Umgebung
- Ubuntu-24.04-CT-Style-Preflight
- Regressionstest für individuelle Passwort-Salts
- Regressionstests für 1-Sekunden-Monitoring, Discord-Verwaltungsoberfläche, Power-/Instanzkontrollen und Browser-Musikbibliothek

Die Erweiterungen werden durch den nächsten vollständigen GitHub-Actions-Lauf erneut verifiziert.
