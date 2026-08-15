# RadioBot 1.3

Native Discord Radio/Music Bot für Ubuntu 24.04 – ohne Docker.

## Ein-Befehl-Installation

```bash
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh | sudo bash
```

Der Installer installiert Node.js 24, FFmpeg, yt-dlp, Deno, den Bot, das responsive Web-Dashboard und einen systemd-Dienst. Discord.js verlangt aktuell Node.js 24.17+; das Installationsprofil nutzt deshalb Node 24. citeturn500829search0

### Ressourcen

**Laufzeit-Ziel für einen kleinen Proxmox-LXC/CT:** 1 vCPU und 500 MB RAM.

Der systemd-Dienst begrenzt den Bot auf maximal 480 MB RAM und **90 % einer CPU**. Dadurch bleiben etwa 10 % eines einzelnen CPU-Kerns als Reserve für das CT-System und kurze Lastspitzen.

**Während der Installation:** Für `apt`, `npm install`, TypeScript-Build sowie yt-dlp/Deno-Setup sollten bis zu **1 GB RAM** eingeplant werden.

## Funktionen

- Internet-Radio über Stream-URL
- lokale MP3/WAV/OGG/FLAC/M4A-Dateien
- YouTube-Suche und Wiedergabe in Discord über yt-dlp + FFmpeg
- zentrale Suche über lokal, Radio, YouTube und optional Spotify
- Play / Pause / Resume / Stop / Skip / Lautstärke
- Queue und gespeicherte Playlists
- Discord-Slash-Commands für Freunde
- Buttons direkt in `/search` zum Starten von Ergebnissen
- Smartphone-Steuerung über das Webinterface
- Spotify-Playlist-Import als Playlist/Referenz
- YouTube-Playlist-Import
- optionale Rollenbeschränkung für Discord-Steuerung

**Spotify Connect-Geräte sind absichtlich nicht Teil des Bots.** Spotify wird nur für Suche und Playlist-Import verwendet; Spotify-Audio wird nicht als Discord-Ausgabe abgespielt.

### Discord-Befehle

```text
/join
/search <query>
/play <query>
/playlist list
/playlist play <name>
/playlist queue <name>
/queue
/now
/pause
/resume
/radio <name>
/stop
/skip
/volume <percent>
```

`/search` zeigt Treffer und Buttons. Abspielbare Treffer sind lokale Dateien, Radios und YouTube. Freunde können damit direkt Musik auswählen, ohne das Webinterface zu öffnen.

Optional kann `DISCORD_CONTROL_ROLE` auf eine Rollen-ID gesetzt werden. Dann dürfen nur Mitglieder mit dieser Rolle oder Administratoren den Bot über Discord steuern.

## Webinterface

Dashboard:

```text
http://SERVER-IP:3000
```

Die Oberfläche ist für Desktop und Smartphone optimiert. Sie enthält eine zentrale Suche, Radioverwaltung, lokale Musik, Queue und Playlist-Verwaltung sowie Spotify-/YouTube-Playlist-Import.

Lokale Musik:

```text
/var/lib/radiobot/music
```

Konfiguration:

```text
/etc/radiobot/radiobot.env
```

## Spotify Playlist importieren

Spotify ist optional. Für den Playlist-Import werden Spotify Developer OAuth-Daten benötigt:

```env
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://SERVER-IP:3000/api/spotify/callback
```

Danach im Webinterface **Spotify verbinden** und eine Playlist-URL importieren.

Spotify-Playlisten werden als Referenz/Import gespeichert. Sie werden **nicht** als Spotify-Audio in Discord extrahiert.

## YouTube

Der Installer bringt yt-dlp und Deno mit. Die aktuelle yt-dlp-Version ist 2026.07.04; moderne YouTube-Extraktion kann einen externen JavaScript-Runtime benötigen, weshalb Deno mitinstalliert wird. citeturn500829search3turn500829search12

Bitte verwende die Wiedergabefunktion nur für Inhalte, die du rechtmäßig nutzen darfst, und beachte die Nutzungsbedingungen der jeweiligen Plattform.

## Sicherheit

Setze ein eigenes `WEB_PASSWORD`. Für einen öffentlich erreichbaren Server wird zusätzlich HTTPS über einen Reverse Proxy empfohlen.

## Betrieb

```bash
radiobot status
radiobot logs
radiobot restart
radiobot config
radiobot update
```
