# MusikBot187 5.0.0

Vollständiger Neuaufbau eines selbst gehosteten Musik- und Radiobots für Ubuntu 24.04/Debian mit Web-Dashboard, YouTube, Radio-Browser, Spotify, lokalen Audiodateien, Queue, Playlists, Discord, TeamSpeak 3, Benutzerrechten, Monitoring und getrenntem privilegiertem Control-Dienst.

Die Dashboard-Suche startet automatisch, zeigt bis zu 50 Treffer je Quelle in einem eigenen Scrollbereich und hält Titel sowie Wiedergabeaktionen ohne horizontales Verschieben sichtbar. YouTube und die Spotify-Auflösung verwenden immer den besten verfügbaren Audiostream. Die Radiosuche bevorzugt je Sender die erreichbare Variante mit der höchsten gemeldeten Bitrate und zeigt Codec sowie Bitrate am Treffer. Discord wird mit 128-kbit/s-Opus ausgegeben. Discord-Instanzen können nach der Kanalauswahl gezielt einem Voice-Channel beitreten; Diagnosemeldungen zeigen drei Einträge kompakt, bleiben scrollbar und lassen sich mit einem Klick kopieren.

Die Wiedergabe zeigt Laufzeit und – soweit von der Quelle bekannt – Gesamtdauer. Lautstärkeänderungen werden als kurze PCM-Pegelrampe angewendet, damit keine harten Signalsprünge entstehen. Für den 24/7-Betrieb startet systemd den Dienst auch nach einem unerwarteten sauberen Prozessende neu. Zusätzlich kann im Dashboard ein täglicher Wartungsneustart in der Zeitzone Europe/Berlin aktiviert werden; Titel, Position, Lautstärke, Modus und Warteschlange werden vorher gespeichert und anschließend automatisch wiederhergestellt.

Spotify verwendet zwei getrennte Freigaben: Client-ID und Client-Secret für die Suche sowie eine einmalige Spotify-Benutzeranmeldung für Playlist-Inhalte. Im Spotify Developer Dashboard muss dafür exakt die im MusikBot eingetragene Callback-Adresse mit dem Pfad `/api/spotify/callback` freigegeben werden. Spotify verlangt HTTPS; nur explizite Loopback-Adressen wie `http://127.0.0.1` dürfen HTTP verwenden. Zugriffs- und Aktualisierungstoken werden ausschließlich verschlüsselt gespeichert und automatisch erneuert. Nach aktuellen Spotify-Vorgaben können Playlists importiert werden, die dem verbundenen Benutzer gehören oder an denen er mitwirkt.

Unter **System → Netzwerk** zeigt das Dashboard Download und Upload live sowie die empfangenen und gesendeten Gesamtmengen seit dem letzten Start des Containers beziehungsweise der Netzwerkschnittstelle.

## Einmal-Installation

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-latest.sh | sudo bash
```

Der Installer gibt den Dashboard- und einmaligen Setup-Link aus. Zielpfade sind `/opt/musikbot187` und `/var/lib/musikbot187`; der Hauptdienst läuft als Benutzer `musikbot187`.

## Entwicklung

Node.js 22 oder neuer wird benötigt.

```bash
cd backend
npm ci
npm test
npm run test:first-run
npm run test:browser
```

## Architektur

`frontend` → Fastify-API → Store/Auth/Permissions → Player → yt-dlp/FFmpeg → Discord/TS3. Für die aktuelle YouTube-Challenge-Auflösung nutzt yt-dlp Node.js 22 und die offizielle EJS-Komponente. Direkte Medienziele werden gegen private und reservierte Netze geprüft. Secrets werden mit AES-256-GCM verschlüsselt. Systemaktionen laufen ausschließlich über `/run/musikbot187/control.sock`.

Weitere Details und offene Umgebungsprüfungen stehen in [docs/deep-audit.md](docs/deep-audit.md).
