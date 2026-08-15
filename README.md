# RadioBot 1.0

Native Discord Radio/Music Bot für Ubuntu 24.04 – ohne Docker.

## Ein-Befehl-Installation

Das Repository muss öffentlich sein. Auf dem Ubuntu-24.04-Server:

```bash
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh | sudo bash
```

Der Installer installiert Node.js 24 LTS, FFmpeg, den Bot, das responsive Web-Dashboard und einen systemd-Dienst.

## Nach der Installation

```bash
radiobot status
radiobot logs
radiobot restart
radiobot config
```

Dashboard:

```text
http://SERVER-IP:3000
```

Daten:

```text
/var/lib/radiobot/
├── music/
├── radiobot.json
└── spotify.json
```

Konfiguration:

```text
/etc/radiobot/radiobot.env
```

## Discord

Unterstützt Radio-Streams und lokale Musik. Slash Commands:

- `/join`
- `/radio`
- `/stop`
- `/skip`
- `/volume`

## Mobile Steuerung

Das Dashboard ist responsive und kann auf dem Smartphone direkt im Browser verwendet bzw. zum Startbildschirm hinzugefügt werden. Die Steuerung läuft über die Web-API.

## Spotify

Spotify wird über die offizielle Spotify Web API integriert: Suche, Geräte, aktuelle Wiedergabe, Play/Pause/Next und Wiedergabe auf einem eigenen Spotify-Connect-Gerät.

Wichtig: Der Bot lädt Spotify-Audios nicht herunter, rippt keine Streams und schickt Spotify-Audio nicht als Discord-Ausgabe. Spotify-Streaming/Playback wird über die offiziellen Spotify-Funktionen auf Spotify-Geräten gesteuert.

### Spotify einrichten

1. Bei Spotify for Developers eine Web-API-App anlegen.
2. Als Redirect URI exakt die URL deines Servers setzen, z.B.:
   `http://SERVER-IP:3000/api/spotify/callback`
3. In `/etc/radiobot/radiobot.env` setzen:

```env
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://SERVER-IP:3000/api/spotify/callback
```

Danach:

```bash
radiobot restart
```

Im Dashboard **Spotify verbinden** anklicken.

## Sicherheit

Setze ein eigenes `WEB_PASSWORD`. Das Dashboard schützt die API dann per HTTP Basic Authentication. Für einen öffentlich erreichbaren Server wird zusätzlich HTTPS über einen Reverse Proxy empfohlen.

## Updates

```bash
radiobot update
```

oder:

```bash
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh | sudo bash
```
