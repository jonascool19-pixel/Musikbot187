# RadioBot 3

Komplett neu aufgebauter Musik-/Radio-Dienst mit Web-Dashboard.

## Enthalten
- Play/Pause/Resume/Stop/Skip, Lautstärke, Queue und Wiedergabemodus
- YouTube-Suche/Wiedergabe über yt-dlp + FFmpeg
- Radio Browser Suche und Wiedergabe
- Spotify Client-Credentials Suche mit anschließender Mediensuche
- Playlists mit Erstellen, Befüllen, Starten und Löschen einzelner Titel
- Discord-Instanzverwaltung, Guild/Voice-Channel-Erkennung und Voice-Ausgabe
- TeamSpeak-3-Instanzen mit Host/Channel/Nickname/Passwort, Verbindung und Opus-Voice-Ausgabe
- Dashboard, Live-Systemdaten, Netzwerk-Interfaces und gespeicherte Kachelreihenfolge als API
- Administrator-Ersteinrichtung, Login und Benutzerrollen
- Ubuntu-Installer, systemd-Dienst, Node 24, yt-dlp, FFmpeg
- CI-Smoke-Test

## Start
`./install.sh` auf Ubuntu ausführen. Danach `http://SERVER:3000` öffnen.

Spotify: `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` als Umgebungsvariablen setzen.

Die neue Architektur trennt Web-UI, Persistenz, Suche, Medienpipeline und Voice-Adapter. Damit können weitere Wiedergabeziele ergänzt werden, ohne die Queue neu zu bauen.