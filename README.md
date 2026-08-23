# MusikBot187 5.0.0

Vollständiger Neuaufbau eines selbst gehosteten Musik- und Radiobots für Ubuntu 24.04/Debian mit Web-Dashboard, YouTube, Radio-Browser, Spotify, lokalen Audiodateien, Queue, Playlists, Discord, TeamSpeak 3, Benutzerrechten, Monitoring und getrenntem privilegiertem Control-Dienst.

Die Dashboard-Suche startet automatisch, zeigt bis zu 50 Treffer je Quelle in einem eigenen Scrollbereich und hält Titel sowie Wiedergabeaktionen ohne horizontales Verschieben sichtbar. Treffer und der aktuell laufende Titel lassen sich ohne Browserdialog direkt einer Playlist hinzufügen. Spotify-Treffer können sofort abgespielt oder in die Warteschlange übernommen werden. YouTube und die Spotify-Auflösung verwenden immer den besten verfügbaren Audiostream. Die Radiosuche bevorzugt je Sender die erreichbare Variante mit der höchsten gemeldeten Bitrate und zeigt Codec sowie Bitrate am Treffer. Discord wird mit 128-kbit/s-Opus ausgegeben und zeigt den laufenden Titel als „Hört …“-Aktivität. Discord-Instanzen können nach der Kanalauswahl gezielt einem Voice-Channel beitreten und platzsparend eingeklappt werden; Diagnosemeldungen zeigen drei Einträge kompakt, bleiben scrollbar und lassen sich mit einem Klick kopieren.

Die Wiedergabe zeigt Laufzeit und – soweit von der Quelle bekannt – Gesamtdauer. Lautstärkeänderungen werden als kurze PCM-Pegelrampe angewendet, damit keine harten Signalsprünge entstehen. Radio erhält zusätzlich einen größeren Discord-Puffer und einen FFmpeg-Zeitausgleich gegen kurze Netzwerk- und Zeitstempellücken. Für den 24/7-Betrieb startet systemd den Dienst auch nach einem unerwarteten sauberen Prozessende neu. Zusätzlich kann im Dashboard ein täglicher Wartungsneustart in der Zeitzone Europe/Berlin aktiviert oder über „Jetzt ausführen“ getestet werden; Titel, Position, Lautstärke, Modus und Warteschlange werden vorher gespeichert und anschließend automatisch wiederhergestellt.

Spotify verwendet zwei getrennte Freigaben: Client-ID und Client-Secret reichen für Suche, Wiedergabe und Warteschlange. Nur der Playlist-Import benötigt einmalig eine Spotify-Benutzerfreigabe. Dafür stellt das Projekt kostenlos die feste HTTPS-Rückrufadresse `https://jonascool19-pixel.github.io/radiobot/spotify-callback/` über GitHub Pages bereit. Diese Adresse muss einmal exakt im Spotify Developer Dashboard als Redirect URI eingetragen werden; eine eigene Domain, ein Zertifikat oder ein kostenpflichtiger Tunnel sind nicht nötig. Der Relay sieht weder Client-Secret noch PKCE-Schlüssel noch Zugriffstokens. Er übermittelt nur den kurzlebigen Autorisierungscode an das bereits geöffnete lokale Dashboard; fällt die Fensterverbindung aus, erfolgt der Rückweg über ein URL-Fragment, das nicht an den lokalen HTTP-Server übertragen wird. Zugriffs- und Aktualisierungstoken werden ausschließlich verschlüsselt im CT gespeichert und automatisch erneuert.

Unter **Dateien** können einzelne YouTube-Links in bester verfügbarer Audioqualität heruntergeladen werden. Sie landen im aufklappbaren Ordner **Downloads**, der ab zehn Einträgen einen eigenen Scrollbereich erhält. Downloads können abgespielt, zur Warteschlange oder zu Playlists hinzugefügt und einzeln oder gesammelt gelöscht werden.

Unter **System → Netzwerk** zeigt das Dashboard Download und Upload live sowie die empfangenen und gesendeten Gesamtmengen seit dem letzten Start des Containers beziehungsweise der Netzwerkschnittstelle. Der überall sichtbare Systemknopf öffnet vier bestätigungspflichtige Aktionen; neben der Ausgabe zeigt ein grüner, orangefarbener oder roter Punkt den aktuellen Verbindungszustand.

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
