# MusikBot187

Native Discord Radio/Music Bot für Ubuntu 24.04 – ohne Docker.

## Ein-Befehl-Installation

Auf einer frischen Ubuntu-Installation genügt dieser eine Befehl. Er aktualisiert zuerst das Ubuntu-System, installiert `curl` und startet danach die MusikBot187-Installation:

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-final.sh | sudo bash
```

Während der Installation fragt der Installer auf einem interaktiven Terminal verbindlich nach **Web-Benutzername und Web-Passwort**. Das Passwort muss mindestens 12 Zeichen lang sein und wird zweimal bestätigt. Anschließend werden Dashboard, Benutzername und Ersteinrichtungs-URL farblich hervorgehoben ausgegeben. Deno wird ohne zusätzliche Rückfrage installiert.

Optional kann im selben Installationslauf eine **separate TeamSpeak-3-Musikinstanz** aktiviert werden. Dafür werden TS3-Server, Botname, Zielkanal und optional die Server-/Kanalpasswörter abgefragt. Die TS3-Instanz läuft als eigener systemd-Dienst neben dem Discord-Bot.

Der `install-final.sh`-Installer lädt einen fest gepinnten Code-Stand und baut das Backend reproduzierbar mit seinen Build-Abhängigkeiten. Er installiert Node.js 24, FFmpeg, yt-dlp, Deno, MusikBot187, das responsive Web-Dashboard und die systemd-Dienste. Während der Installation sollten bis zu **1 GB RAM** eingeplant werden.

Nach der Installation ist keine manuelle Linux-Konfiguration nötig: Der Installer zeigt eine einmalige **Ersteinrichtungs-URL** an. Darüber werden Discord, Web-Zugang, Spotify, YouTube und weitere Einstellungen direkt im Browser eingerichtet. Der einmalige Code steckt im URL-Fragment (`#setup=...`) und wird nach erfolgreicher Einrichtung gelöscht.

## Empfohlenes Laufzeitprofil

Für einen Discord-Server, einen Voice-Channel und normale Radio-/Musikwiedergabe ist ein kleiner Proxmox-LXC/CT ausreichend:

- **1 vCPU**
- **768 MB RAM empfohlen** für stabile Radio-, Lokal- und YouTube-Wiedergabe
- **500–512 MB RAM** als Minimalprofil für einfache Radio-/Lokalnutzung
- **bis 1 GB RAM** bei höherer Last, vielen Suchvorgängen oder mehreren parallelen Quellen
- **2 vCPU / 1 GB RAM** bei mehreren parallelen Voice-Instanzen

Der laufende Dienst ist auf **720 MB RAM** und **90 % eines CPU-Kerns** begrenzt. `MemoryHigh=640M` regelt vorher und `Nice=5` lässt dem CT-System Priorität. Damit bleibt MusikBot187 ressourcenschonend, ohne YouTube-/FFmpeg-Spitzen unnötig hart abzuwürgen.

## Webinterface und Ersteinrichtung

Dashboard:

```text
http://SERVER-IP:3000
```

Die Oberfläche ist für Desktop und Smartphone optimiert. Sie enthält Player-Steuerung, Queue, Radioverwaltung, lokale Musik, Playlists, globale Suche, Spotify-Playlist-Import, YouTube-Playlist-Import, Status-Channel-Konfiguration, Leistungs-/Netzwerkmonitor und einen **Update-Button**.

### Instanzen wie beim SinusBot

Wenn TeamSpeak 3 aktiviert wurde, erscheint oben im Dashboard ein **Instanz-Schalter**:

```text
Discord  ↔  TeamSpeak 3
```

Der Webplayer arbeitet immer auf der aktuell ausgewählten Instanz. Damit kannst du im selben Browser nacheinander den Discord-Bot und den TS3-Bot steuern, ohne zwei getrennte Oberflächen zu benötigen. Player, Pause/Resume, Stop, Skip, Lautstärke, Suche, Radios, lokale Musik, Playlists und Queue werden auf die aktive Instanz angewendet.

Discord und TS3 bleiben technisch getrennte Prozesse. Ein Wechsel im Webinterface schaltet nur den **Steuerkontext**, nicht den jeweils anderen Bot aus.

Beim ersten Aufruf über die Ersteinrichtungs-URL erscheint ein geführter Assistent für:

- Discord Bot Token
- Web-Benutzer und Web-Passwort
- Discord Control Role ID
- Port
- öffentliche URL
- Spotify Client ID / Secret / Redirect URI
- YouTube API Key

Danach können die Einstellungen jederzeit über **Einstellungen** im Webinterface geändert werden. Änderungen werden sicher über einen root-owned Konfigurationshelfer geschrieben und der Dienst automatisch neu gestartet.

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

## TeamSpeak 3

TeamSpeak 3 ist optional und läuft als **eigene Musikinstanz**. Discord und TS3 teilen sich die installierten Audio-Werkzeuge, aber nicht den Voice-Prozess.

Der TS3-Bot verbindet sich als normaler Client mit einem vorhandenen TeamSpeak-3-Server und kann Musik per Opus in den konfigurierten Kanal senden. Die aktuelle Clientbibliothek unterstützt TS3 und rohe Opus-Voice-Pakete.

Befehle im TS3-Kanal:

```text
!play <Titel, Suche oder URL>
!radio <Stream-URL>
!queue
!skip
!pause
!resume
!stop
```

Die TS3-Instanz besitzt eine eigene persistent gespeicherte Identität unter `/var/lib/radiobot/ts3-identity.txt` und wird bei der Installation als `radiobot-ts3.service` eingerichtet. Bei Updates bleibt eine bestehende TS3-Konfiguration erhalten.

Der Installer richtet **keinen TeamSpeak-Server** ein; er verbindet den Bot mit einem bereits vorhandenen TS3-Server.

## Discord-Statuskanal

Mit:

```text
/statuschannel #bot-status
```

legt man einen Textkanal für den Bot fest. Dort hält MusikBot187 eine einzelne Statusnachricht aktuell mit aktuell laufendem Titel, Quelle/Playlist, Wiedergabestatus, den nächsten Queue-Einträgen, Lautstärke und Zeitstempel.

## Radio

Im Webinterface kann nach Radiosendern gesucht werden, ohne Stream-URLs manuell einzutragen. Treffer können direkt gespeichert und abgespielt werden. Gespeicherte Sender landen automatisch in der Playlist **Radio**.

Die Radio-Playlist unterstützt Wiedergabe, Queue, Zufallswiedergabe sowie Wiederholung der aktuellen Quelle oder der gesamten Playlist.

## Quellen

### Lokal

MP3/WAV/OGG/FLAC/M4A nach:

```text
/var/lib/radiobot/music
```

### Radio

Sender werden über das Radio-Browser-Verzeichnis gesucht; gespeicherte Streams werden direkt über FFmpeg im Discord-Voice-Channel wiedergegeben. Der TS3-Bot kann zusätzlich direkte Radio-Stream-URLs abspielen.

### YouTube

Suche, Video-URLs und Playlist-Import werden über `yt-dlp` abgewickelt. Das Audio wird für die Discord-Wiedergabe mit FFmpeg verarbeitet.

### Spotify

Spotify wird **nicht über Spotify Connect** abgespielt. Es gibt keine Geräteauswahl und keine Spotify-Wiedergabe im Bot.

Spotify kann optional per OAuth verbunden werden, um Titel zu suchen und Playlists zu importieren. Beim Abspielen werden importierte Titel als Suchbegriffe über YouTube aufgelöst.

## Leistung und Netzwerk

Über **Leistung** im Webinterface gibt es Live-Monitoring für:

- CPU-Auslastung
- Load Average
- RAM-Auslastung
- freien/belegten RAM
- Laufwerksbelegung
- aktuelle Downloadrate
- aktuelle Uploadrate
- kumulierten Download
- kumulierten Upload

Die Netzwerkwerte beziehen sich auf den gesamten Ubuntu-CT, nicht ausschließlich auf MusikBot187.

## Update-System

Im Webinterface gibt es einen **Update-Button**. Er startet einen root-owned Update-Helfer, lädt die fest gepinnte getestete Version, baut das Backend neu und startet die systemd-Dienste automatisch neu. Konfiguration, TS3-Identität und Musikdaten bleiben erhalten.

Alternativ per Konsole:

```bash
radiobot update
```

## Sicherheit

Das Dashboard nutzt eine **sessionbasierte Web-Authentifizierung per HttpOnly-Cookie**. Für CLI-/CI-Aufrufe wird zusätzlich HTTP Basic Authentication als kompatible Alternative akzeptiert. Die Konfiguration liegt mit restriktiven Dateirechten unter `/etc/radiobot`. Der laufende Dienst läuft als unprivilegierter Benutzer `radiobot` mit `NoNewPrivileges`, `ProtectSystem`, `ProtectHome`, ohne Swap und mit begrenzter CPU-/RAM-Nutzung. Der Installer erzwingt Same-Origin-CORS.

Die TS3-Zugangsdaten liegen getrennt und mit `0600` unter `/etc/radiobot/ts3.env`. Die TS3-Identität wird ebenfalls restriktiv gespeichert. Der TS3-Dienst läuft unprivilegiert und erhält nur Schreibzugriff auf `/var/lib/radiobot`.

Der einmalige Ersteinrichtungs-Code wird nur als URL-Fragment verwendet und daher nicht an den Webserver gesendet. Nach erfolgreicher Einrichtung wird er aus der Konfiguration entfernt.

Der Konfigurationshelfer akzeptiert nur eine feste Liste erlaubter Einstellungen, schreibt atomar mit `0600` und ist über eine restriktive sudo-Regel erreichbar. Das Webinterface bekommt niemals root-Rechte.

Für einen öffentlich erreichbaren Server wird HTTPS über einen Reverse Proxy empfohlen. Das Repository enthält keine Discord-/Spotify-/TS3-Zugangsdaten; diese werden nur lokal gespeichert.

## Autostart

Der Discord-Bot wird als systemd-Dienst installiert und beim Systemstart automatisch aktiviert. Der Metrics-Timer wird ebenfalls automatisch aktiviert. Wenn TS3 aktiviert wurde, startet zusätzlich `radiobot-ts3.service` automatisch zusammen mit dem MusikBot.

## Statuskanal-Rechte

Der Statuskanal sollte **Nachrichten senden**, **Nachrichten lesen** und **Nachrichten verwalten** erlauben, damit MusikBot187 seine eine Statusnachricht zuverlässig aktualisieren kann.
