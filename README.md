# RadioBot 1.1

Native Discord Radio/Music Bot für Ubuntu 24.04 – ohne Docker.

## Ein-Befehl-Installation

```bash
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh | sudo bash
```

Der Installer richtet Node.js 24 LTS, FFmpeg, den Bot, das responsive Web-Dashboard und einen systemd-Dienst ein.

### Ressourcen

**Laufzeit-Ziel für einen kleinen Proxmox-LXC/CT:** 1 vCPU und 500 MB RAM.

Der systemd-Dienst begrenzt den Bot auf maximal 480 MB RAM und **90 % einer CPU**. Dadurch bleiben ungefähr 10 % eines einzelnen CPU-Kerns als Reserve für das CT-System und kurze Lastspitzen.

**Während der Installation:** Für `apt`, `npm install` und den TypeScript-Build sollten bis zu **1 GB RAM** eingeplant werden. Nach erfolgreicher Installation gelten die kleineren Laufzeitlimits.

## Funktionen

- modernes responsives Dashboard für Desktop und Smartphone
- Discord-Server- und Voice-Channel-Auswahl
- Internet-Radio per HTTP(S)-Stream
- lokale Musik aus `/var/lib/radiobot/music`
- Play / Pause / Stop / Skip / Lautstärke
- Queue mit Hinzufügen/Leeren
- lokale und Radio-Playlists
- zentrale **Suche** über lokale Musik, Radios, Spotify und YouTube
- Spotify OAuth, Spotify-Suche, Spotify-Connect-Geräte, Play/Pause/Next
- **Spotify-Playlist-Import** in die RadioBot-Playlistverwaltung
- **YouTube-Suche** und **YouTube-Playlist-Import** über die offizielle YouTube Data API
- YouTube-Videos können im Webinterface eingebettet oder direkt geöffnet werden
- automatische systemd-Start/Restart-Logik
- native Ubuntu-Installation, kein Docker nötig

## Playlist-Verhalten

### Lokal + Radio
Diese Playlists können über das Dashboard direkt in Discord abgespielt werden.

### Spotify
Spotify-Playlists werden über OAuth importiert und als RadioBot-Playlist gespeichert. Beim Start wird die Playlist auf einem aktiven Spotify-Connect-Gerät wiedergegeben. Der Bot extrahiert kein Spotify-Audio und schickt Spotify-Audio nicht als Discord-Stream.

### YouTube
YouTube-Suchergebnisse und Playlisten werden über die offizielle API verwaltet. Videos werden im YouTube-Webplayer eingebettet/geöffnet. **Es gibt keinen YouTube-Audio-Ripper und keinen YouTube-zu-Discord-Stream.**

## YouTube einrichten

Für YouTube-Suche und Playlist-Import eine Google/YouTube Data API v3 API-Key erstellen und setzen:

```bash
radiobot config
```

Dann:

```env
YOUTUBE_API_KEY=...
```

Danach:

```bash
radiobot restart
```

Ohne API-Key funktionieren Radio, lokale Musik und die übrigen Funktionen trotzdem.

## Spotify einrichten

1. Bei Spotify for Developers eine Web-API-App anlegen.
2. Als Redirect URI exakt setzen, z.B.:
   `http://SERVER-IP:3000/api/spotify/callback`
3. In `/etc/radiobot/radiobot.env` eintragen:

```env
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://SERVER-IP:3000/api/spotify/callback
```

Danach `radiobot restart` ausführen und im Dashboard **Spotify verbinden** anklicken.

## Daten und Konfiguration

```text
/var/lib/radiobot/
├── music/
├── radiobot.json
└── spotify.json

/etc/radiobot/radiobot.env
```

## Dienstbefehle

```bash
radiobot status
radiobot logs
radiobot restart
radiobot config
radiobot update
```

Dashboard:

```text
http://SERVER-IP:3000
```

## Sicherheit

Das Dashboard nutzt `WEB_USER`/`WEB_PASSWORD` per HTTP Basic Authentication. Für einen öffentlich erreichbaren Server wird zusätzlich HTTPS über einen Reverse Proxy empfohlen.
