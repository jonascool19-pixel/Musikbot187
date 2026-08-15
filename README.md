# RadioBot 2.0

Native Discord Radio/Music Bot für Ubuntu 24.04 – ohne Docker.

## Ein-Befehl-Installation

```bash
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh | sudo bash
```

Der Installer installiert Node.js 24, FFmpeg, yt-dlp, Deno, den Bot, das responsive Web-Dashboard und einen systemd-Dienst. Während der Installation sollten bis zu **1 GB RAM** eingeplant werden.

## Empfohlenes Laufzeitprofil

Für **einen Discord-Server, einen Voice-Channel und normale Radio-/Musikwiedergabe** ist ein kleiner Proxmox-LXC/CT ausreichend:

- **1 vCPU**
- **768 MB RAM** empfohlen für stabile Radio-, Lokal- und YouTube-Wiedergabe
- **512 MB RAM** als Minimalprofil für einfache Radio-/Lokalnutzung
- **2 vCPU / 1 GB RAM** bei mehreren parallelen Voice-Instanzen oder deutlich höherer Last
- etwa **10–20 GB SSD** für System, Logs und lokale Musik

Der laufende Dienst ist auf **720 MB RAM** und **90 % eines CPU-Kerns** begrenzt. `MemoryHigh=640M` regelt vorher und `Nice=5` lässt dem CT-System Priorität. Damit wird der Bot nicht unnötig auf 500 MB künstlich ausgehungert, bleibt aber deutlich ressourcenschonender als ein typischer Voll-Server-Bot.

Die Node-Laufzeit ist auf einen kleinen Heap begrenzt; FFmpeg und yt-dlp sind nur bei aktiver Wiedergabe beziehungsweise Suche aktiv. Ein einzelner Radio- oder lokaler Audio-Stream benötigt normalerweise nur einen kleinen Teil eines CPU-Kerns. YouTube-Auflösung und FFmpeg sind die deutlich variableren Lastquellen.

> Die Werte sind ein konservatives Betriebsprofil, keine Garantie für jede Quelle. Die tatsächliche Last hängt insbesondere von Codec, Quelle, Anzahl paralleler Wiedergaben und Suchvorgängen ab.

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

Damit können Freunde den Bot direkt in Discord steuern. Über `/search` gibt es Suchergebnisse mit Abspiel-Buttons. Eine optionale `DISCORD_CONTROL_ROLE` kann festlegen, welche Rolle steuern darf.

## Discord-Statuskanal

Mit:

```text
/statuschannel #bot-status
```

legt man einen Textkanal für den Bot fest. Dort hält RadioBot eine einzelne Statusnachricht aktuell mit:

- aktuell laufendem Titel
- Quelle bzw. Playlist
- Wiedergabestatus
- den nächsten Queue-Einträgen
- Lautstärke
- Zeitstempel

Die Statusnachricht wird bei Änderungen automatisch bearbeitet statt ständig neue Nachrichten zu posten.

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

Spotify kann optional per OAuth verbunden werden, um Titel zu suchen und Playlists zu importieren. Beim Abspielen werden die importierten Titel als Suchbegriffe über YouTube aufgelöst, damit die Playlist im Discord-Voice-Channel wiedergegeben werden kann.

## Update-System

Im Webinterface gibt es einen **Update**-Button. Er startet einen root-owned Update-Helfer, lädt die aktuelle Version von GitHub, installiert Änderungen, baut das Backend neu und startet `radiobot.service` automatisch neu.

Alternativ per Konsole:

```bash
radiobot update
```

Status/Logs:

```bash
radiobot status
radiobot logs
```

Das Update benötigt keine Neuinstallation und erhält `/var/lib/radiobot` sowie `/etc/radiobot/radiobot.env`.

## Sicherheit

Setze ein eigenes `WEB_PASSWORD`. Das Dashboard schützt die API dann per HTTP Basic Authentication. Für einen öffentlich erreichbaren Server wird HTTPS über einen Reverse Proxy empfohlen.

## Hinweis

Der Statuskanal sollte die Discord-Rechte **Nachrichten senden**, **Nachrichten lesen** und **Nachrichten verwalten** besitzen, damit RadioBot seine eine Statusnachricht zuverlässig aktualisieren kann.
