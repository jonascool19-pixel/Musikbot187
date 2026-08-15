# MusikBot187

Native Discord Radio/Music Bot für Ubuntu 24.04 – ohne Docker.

## Ein-Befehl-Installation

```bash
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh | sudo bash
```

Der Installer installiert Node.js 24, FFmpeg, yt-dlp, Deno, MusikBot187, das responsive Web-Dashboard und einen systemd-Dienst. Während der Installation sollten bis zu **1 GB RAM** eingeplant werden.

## Empfohlenes Laufzeitprofil

Für einen Discord-Server, einen Voice-Channel und normale Radio-/Musikwiedergabe ist ein kleiner Proxmox-LXC/CT ausreichend:

- **1 vCPU**
- **768 MB RAM empfohlen** für stabile Radio-, Lokal- und YouTube-Wiedergabe
- **500–512 MB RAM** als Minimalprofil für einfache Radio-/Lokalnutzung
- **bis 1 GB RAM** bei höherer Last, vielen Suchvorgängen oder mehreren parallelen Quellen
- **2 vCPU / 1 GB RAM** bei mehreren parallelen Voice-Instanzen

Der laufende Dienst ist auf **720 MB RAM** und **90 % eines CPU-Kerns** begrenzt. `MemoryHigh=640M` regelt vorher und `Nice=5` lässt dem CT-System Priorität. Damit bleibt MusikBot187 ressourcenschonend, ohne YouTube-/FFmpeg-Spitzen unnötig hart abzuwürgen.

FFmpeg und yt-dlp werden nur bei aktiver Wiedergabe beziehungsweise Suche verwendet. Die tatsächliche Last hängt von Quelle, Codec, Anzahl paralleler Wiedergaben und Suchvorgängen ab.

## Webinterface

Dashboard:

```text
http://SERVER-IP:3000
```

Die Oberfläche ist für Desktop und Smartphone optimiert. Sie enthält Player-Steuerung, Queue, Radioverwaltung, lokale Musik, Playlists, globale Suche, Spotify-Playlist-Import, YouTube-Playlist-Import, Status-Channel-Konfiguration und einen **Update-Button**.

## Discord-Steuerung

Slash Commands:

- `/join`
- `/statuschannel`
- `/search`
- `/play`
- `/playlist list|play|queue`
- `/queue`
- `/now`
- `/pause`
- `/resume`
- `/radio`
- `/stop`
- `/skip`
- `/volume`

Damit können Freunde Musik direkt in Discord suchen, Titel starten, Playlists wechseln und die Wiedergabe steuern. Eine optionale `DISCORD_CONTROL_ROLE` kann festlegen, welche Rolle steuern darf.

## Discord-Statuskanal

Mit:

```text
/statuschannel #bot-status
```

legt man einen Textkanal für den Bot fest. Dort hält MusikBot187 eine einzelne Statusnachricht aktuell mit aktuell laufendem Titel, Quelle/Playlist, Wiedergabestatus, den nächsten Queue-Einträgen, Lautstärke und Zeitstempel.

## Quellen

### Lokal

MP3/WAV/OGG/FLAC/M4A nach:

```text
/var/lib/radiobot/music
```

### Radio

HTTP(S)-Radio-Streams können im Webinterface angelegt und direkt abgespielt werden.

### YouTube

Suche, Video-URLs und Playlist-Import werden über `yt-dlp` abgewickelt. Das Audio wird für die Discord-Wiedergabe mit FFmpeg verarbeitet.

### Spotify

Spotify wird **nicht über Spotify Connect** abgespielt. Es gibt keine Geräteauswahl und keine Spotify-Wiedergabe im Bot.

Spotify kann optional per OAuth verbunden werden, um Titel zu suchen und Playlists zu importieren. Beim Abspielen werden importierte Titel als Suchbegriffe über YouTube aufgelöst.

## Update-System

Im Webinterface gibt es einen **Update-Button**. Er startet einen root-owned Update-Helfer, lädt die aktuelle Version, baut das Backend neu und startet den systemd-Dienst automatisch neu.

Alternativ per Konsole:

```bash
radiobot update
```

## Sicherheit

Das Dashboard nutzt HTTP Basic Authentication, wenn `WEB_PASSWORD` gesetzt ist. Die Konfiguration liegt mit restriktiven Dateirechten unter `/etc/radiobot`. Der laufende Dienst läuft als unprivilegierter Benutzer `radiobot` mit `NoNewPrivileges`, `ProtectSystem`, `ProtectHome`, ohne Swap und mit begrenzter CPU-/RAM-Nutzung. Der Installer erzwingt zusätzlich Same-Origin-CORS.

Für einen öffentlich erreichbaren Server wird HTTPS über einen Reverse Proxy empfohlen. Das Repository enthält keine Discord-/Spotify-Schlüssel; diese werden nur lokal in `/etc/radiobot/radiobot.env` gespeichert.

## Statuskanal-Rechte

Der Statuskanal sollte **Nachrichten senden**, **Nachrichten lesen** und **Nachrichten verwalten** erlauben, damit MusikBot187 seine eine Statusnachricht zuverlässig aktualisieren kann.
