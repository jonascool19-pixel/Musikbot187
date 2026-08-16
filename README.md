# Musikbot 187

Komplett neuer Musik- und Radiobot mit Web-Dashboard für Discord und TeamSpeak 3.

## Funktionen
- Musik: Play, Pause, Resume, Stop, Skip, Lautstärke, Queue, Wiedergabemodus, aktive Ausgabe
- YouTube über yt-dlp + FFmpeg
- Radio Browser Suche und Wiedergabe über dieselbe Player-Pipeline
- Spotify Suche über Client-Credentials und anschließende Mediensuche
- Playlists erstellen, öffnen, befüllen, starten und einzelne Titel löschen
- Live-Suche beim Tippen
- Mehrere Discord-Instanzen, Guild-/Voice-Channel-Auswahl, Prefix und Invite-Link
- Mehrere TeamSpeak-3-Instanzen
- Dashboard mit farbigen Themen, Icons, Bearbeitungsmodus, Drag-and-Drop und gesperrten Kacheln im Normalmodus
- Netzwerkinterface-Auswahl im eigenen Einstellungen-Reiter, Live RX/TX und Gesamtwerte
- Ersteinrichtung, Administrator, Login, Benutzer/Rollen, Diagnose und gespeicherte UI-Anordnung
- systemd-Dienst als eigener Benutzer mit CPU-/RAM-Limits
- Ubuntu-Installer, Node 24, Deno, yt-dlp und FFmpeg
- CI-Smoke-Tests und Ressourcen-Benchmark

## Installation
```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-stable.sh | sudo bash
```
Danach `http://SERVER-IP:3000` öffnen und den Administrator anlegen.
