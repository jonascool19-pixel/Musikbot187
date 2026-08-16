# 🎵 Musikbot 187

**Musikbot 187** ist ein selbstgehosteter Musik-, Radio- und Voice-Bot mit Web-Dashboard für **Discord und TeamSpeak 3**. Das Projekt ist auf eine saubere, modulare Installation mit systemd, Node.js 24, Deno, yt-dlp und FFmpeg ausgelegt.

## ✨ Funktionen

### 🎵 Wiedergabe
- Musik abspielen
- Play / Pause / Resume / Stop / Skip
- Lautstärkeregelung
- Queue / Warteschlange
- Wiedergabemodi: Queue, Repeat und Shuffle
- Aktive Ausgabe-/Instanz auswählen
- Wiedergabe über Discord oder TeamSpeak 3
- YouTube-Suche und Wiedergabe über yt-dlp + FFmpeg
- Radio Browser als weitere Wiedergabequelle
- Spotify-Suche über Client-Credentials mit anschließender Mediensuche

### 📻 Radio
- Radiosender suchen
- Sender auswählen und abspielen
- Radio verwendet dieselbe Wiedergabe-Infrastruktur wie normale Musik
- Radiosender können in die Queue übernommen werden

### 📋 Playlists
- Playlists erstellen und verwalten
- Titel zu Playlists hinzufügen
- Playlist-Inhalte öffnen
- Playlists vollständig starten
- einzelne Titel aus Playlists löschen
- Suchergebnisse direkt in Playlists übernehmen

### 🔎 Suche
- Normale Musiksuche
- YouTube-Suche
- Radio-Suche
- Spotify-Suche
- Automatische Suche bereits während der Eingabe
- Suchergebnisse direkt abspielen
- Suchergebnisse in eine Playlist übernehmen

### 🎧 Discord
- Mehrere Discord-Instanzen gleichzeitig verwalten
- Jede Instanz einzeln ein-/ausschalten
- Bot-Token konfigurieren
- Client-ID konfigurieren
- Guild/Discord-Server auswählen
- Voice-Channel auswählen
- Discord-Server automatisch laden
- Voice-Channels automatisch laden
- Bot verbinden / trennen
- Voice beitreten
- Bot direkt aus der Instanzverwaltung zu Discord einladen
- Einladungslink kopieren
- Prefix konfigurieren
- Bot-Status und Verbindungsstatus anzeigen
- Steuerung über Discord-Befehle, unter anderem:
  - `play`
  - `pause`
  - `resume`
  - `skip`
  - `stop`
  - `volume`
  - `queue`

### 🎙️ TeamSpeak 3
- Mehrere TS3-Instanzen verwalten
- Jede Instanz einzeln ein-/ausschalten
- Server / Host konfigurieren
- Port konfigurieren
- Channel konfigurieren
- Nickname konfigurieren
- Serverpasswort konfigurieren
- Verbindung und Status verwalten
- Verbinden / Trennen

## 🧙 Ersteinrichtung

Nach dem Anlegen des Administrators führt Musikbot 187 durch einen Einrichtungsassistenten. Dabei kann direkt ausgewählt werden:

- 🎧 erste Discord-Instanz einrichten
- 🎙️ erste TeamSpeak-3-Instanz einrichten
- ⏭️ Instanzen später einrichten

Nach der Ersteinrichtung können jederzeit weitere Discord- und TS3-Instanzen hinzugefügt oder einzelne Instanzen deaktiviert werden.

Das Administratorkonto verwendet eine Passwort-Mindestlänge von **5 Zeichen**.

## 🖥️ Dashboard

Das Dashboard bietet:

- mehrere farbige Themen
- farbige Kacheln und Icons
- geschützte/schreibgeschützte Kacheln außerhalb des Bearbeitungsmodus
- Drag-&-Drop-UI-Baukasten
- gespeicherte Kachelreihenfolge
- „Jetzt läuft“
- Queue
- Wiedergabemodus
- Lautstärke
- Schnellzugriff auf Suche, Radio, Playlists und Dateien
- CPU-Anzeige
- RAM-Anzeige
- Netzwerk-Anzeige
- Discord-/TS3-Status
- aktive Instanz auswählen
- obere Live-Leiste mit Systemauslastung, Netzwerk und **laufender Uhrzeit**
- Buttons für Bot-Neustart und System-Neustart/-Ausschalten

Die Uhrzeit wird laufend aktualisiert.

In der oberen Netzwerk-Anzeige werden **Download-/Upload-Auslastung in Prozent** angezeigt. Die detaillierten Daten- und Gesamtverbrauchswerte stehen im Netzwerk-Bereich der Einstellungen.

## 🌐 Netzwerk

- Netzwerkkarte/Interface auswählen
- Auswahl in den Einstellungen speichern
- Download-/Upload-Werte
- Live-Netzwerkdurchsatz
- Download-/Upload-Auslastung in Prozent in der oberen Statusleiste
- Gesamtverbrauch je Interface
- eigener Netzwerk-Einstellungsbereich

## ⚙️ Einstellungen & Verwaltung

- Ersteinrichtung
- Administrator-Benutzer
- Anmeldung
- Benutzer- und Rollenverwaltung
- Discord-Konfiguration
- TeamSpeak-3-Konfiguration
- Spotify-Konfiguration
- System- und UI-Einstellungen
- Netzwerk-Einstellungen
- Dashboard-Anordnung speichern
- Diagnose und Fehlermeldungen

## 🛠️ System & Installation

- eigener Systembenutzer `musikbot187`
- systemd-Service
- CPU-/RAM-Limits
- Ubuntu-Installer
- Node.js 24
- Deno
- yt-dlp
- FFmpeg
- automatische Deno-Installation ohne interaktive Rückfrage
- farbig hervorgehobener Einrichtungslink nach der Installation
- automatische Ermittlung der Server-IP
- vorhandener cloudflared-Tunnel wird für den öffentlichen Einrichtungslink bevorzugt
- CI-Smoke-Tests
- Ressourcen-Benchmark

## 🚀 Installation

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-stable.sh | sudo bash
```

Der Installer richtet die benötigten Systempakete, Node.js 24, Deno, FFmpeg und yt-dlp ein, baut Musikbot 187 und startet den systemd-Service.

Nach erfolgreicher Installation wird der Einrichtungslink prominent und farblich hervorgehoben ausgegeben. Dabei wird bevorzugt ein vorhandener cloudflared-Tunnel verwendet; andernfalls wird die ermittelte Server-IP mit Port 3000 verwendet.

## 🧪 Qualität & Diagnose

Der Projektstand enthält CI-Prüfungen für Backend, Frontend und Installer-/Shell-Dateien sowie einen Ressourcen-Benchmark. Laufzeitfehler werden im Diagnosebereich des Dashboards erfasst.

## 📁 Projekt

Repository: `jonascool19-pixel/radiobot`

**Musikbot 187** — Musik, Radio, Discord, TeamSpeak 3 und Web-Dashboard in einer selbstgehosteten Anwendung.
