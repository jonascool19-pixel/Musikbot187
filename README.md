# MusikBot187 · Version 1.8.7

[![Ubuntu-Audit](https://github.com/jonascool19-pixel/Musikbot187/actions/workflows/ci.yml/badge.svg)](https://github.com/jonascool19-pixel/Musikbot187/actions/workflows/ci.yml)

Ein selbst gehosteter Musik- und Radiobot für einen **Ubuntu-24.04-CT** mit modernem Web-Dashboard, YouTube, Radio, Spotify, lokalen Dateien, Playlists, automatischer Wiedergabe und Discord-Steuerung.

MusikBot187 ist für den dauerhaften Betrieb im eigenen Netzwerk gebaut. Die komplette Einrichtung und Bedienung läuft im Dashboard; Passwörter, Tokens und Spotify-Zugänge bleiben verschlüsselt im eigenen Container.

## Auf einen Blick

| Bereich | Funktionen |
| --- | --- |
| Musikquellen | YouTube, Radio-Browser, Spotify-Suche, Spotify-Playlists, direkte Streams und lokale Audiodateien |
| Wiedergabe | Play, Pause, Weiter, Skip, Stop, Lautstärke, Spulen, verschiebbare Warteschlange und Wiederhol-/Zufallsmodus |
| Ausgaben | Bis zu zwei Discord- und zwei TeamSpeak-Instanzen, getrennte Player oder synchroner Spiegelmodus |
| Automatik | Endlosschleife aus eigenen Playlists oder persönlicher Mix aus der lokalen Hörhistorie |
| Verwaltung | Hauptadmin, Benutzerrollen, einzelne Rechte, Diagnosen, Monitoring, Netzwerkverlauf und Updates |
| 24/7-Betrieb | Automatischer Wiederanlauf, Internet-Reconnect, täglicher Wartungsneustart und Wiedergabe-Fortsetzung |

## Musik, Suche und Playlists

- Die Suche startet automatisch ab zwei Zeichen und hält bis zu 150 eindeutige Treffer in einer kompakten Scrollliste.
- Die zuletzt gewählte Quelle bleibt gespeichert: Alle, YouTube, Radio oder Spotify.
- Suchtreffer lassen sich sofort abspielen, in die Warteschlange oder ohne Browser-Popup in eine Playlist übernehmen.
- Jede Playlist ist aufklappbar. Jeder einzelne Titel besitzt einen eigenen **Play**-Knopf.
- Der aktuell laufende Titel kann ebenfalls direkt einer Playlist hinzugefügt werden.
- Die Wiedergabe verwendet die beste verfügbare Audioqualität; Radio bevorzugt die höchste erreichbare Bitrate.
- Der nächste Wartelisteneintrag wird im Hintergrund vorbereitet, damit Titel schneller wechseln.
- Titel lassen sich mit Pfeilen in der Warteschlange nach oben oder unten verschieben, ohne die laufende Wiedergabe zu unterbrechen.
- Ungeeignete oder dauerhaft nicht verfügbare Quellen werden übersprungen, statt den Player minutenlang zu blockieren.

## Spotify ohne eigene Domain

Client-ID und Client-Secret reichen für Spotify-Suche und Wiedergabe. Für den Import eigener Spotify-Playlists wird einmalig die kostenlose sichere Callback-Adresse eingetragen:

```text
https://jonascool19-pixel.github.io/Musikbot187/spotify-callback/
```

Der Rückweg übermittelt nur einen kurzlebigen Spotify-Code. Client-Secret, PKCE-Schlüssel sowie Zugriffs- und Aktualisierungstoken bleiben im Ubuntu-CT. Eine eigene Domain, ein Zertifikat oder ein kostenpflichtiger Tunnel sind nicht nötig.

Importierte Spotify-Playlists bleiben mit Spotify verknüpft. Neue und entfernte Titel werden automatisch gespiegelt. Der Abgleich ist pro Playlist auf 1, 5, 12, 24 oder 48 Stunden beziehungsweise wöchentlich einstellbar und kann jederzeit sofort gestartet werden.

## Discord

Discord-Instanzen können getrennte Musik spielen oder denselben Player spiegeln. Nach Auswahl eines Voice-Channels tritt der Bot über den eigenen Button bei. Der aktuell laufende Titel erscheint in Discord als „Hört …“-Aktivität.

Einrichtung in der richtigen Reihenfolge:

1. Name, Bot-Token und Client-ID/Bot-ID eintragen und **Speichern / verbinden** wählen.
2. **Bot zu Discord hinzufügen** öffnen und den gewünschten Server bestätigen.
3. Neben Voice-Channel auf **↻** klicken, damit die erreichbaren Server und Kanäle geladen werden.
4. Discord-Server und Voice-Channel auswählen.
5. **Voice-Channel betreten** wählen. Ein noch laufender Verbindungsaufbau wird automatisch abgewartet, statt fälschlich „nicht verbunden“ zu melden. Der vorherige Hinweis zur Serverauswahl ist nur ein Einrichtungsstatus und wird nach erfolgreichem Beitritt aus alten Warnungen entfernt.

Unterstützte Slash-Befehle:

```text
/play  /pause  /resume  /skip  /stop
/clear /volume /queue   /nowplaying /help
```

Bei `/play` erscheinen beim Tippen bis zu zehn echte YouTube-Treffer. Bereits bekannte Treffer bleiben beim Weiter-tipppen sichtbar, statt aus der nächsten Vorschlagsliste zu verschwinden. Nach der Auswahl wird exakt die gewählte Video-ID eingereiht; Freitext bleibt als Rückfall möglich. Die Suche verwendet eine echte YouTube-Suchergebnis-Adresse und ist damit nicht mehr von der fehleranfälligen internen `ytsearch`-Pseudo-URL abhängig. Langsame Befehle werden sofort von Discord bestätigt und anschließend beantwortet. Antwort-, Such- oder Logfehler bleiben innerhalb des Discord-Moduls und können den Musikdienst nicht mehr beenden. Alle Netzwerkquellen besitzen Zeitgrenzen und automatische Wiederverbindung. YouTube, Spotify und lokale Dateien werden in Echtzeit getaktet; ein bereits live eintreffender Radiostream wird nicht ein zweites Mal künstlich gebremst. Vor Discord werden für YouTube 1,5 Sekunden sowie für Live-Radio und Spotify jeweils zwei Sekunden Ton vorbereitet. Der begrenzte Rückstaupuffer glättet kurze Schwankungen, ohne im Dauerbetrieb unbegrenzt Verzögerung aufzubauen. Am regulären Titelende darf dieser Puffer vollständig ausspielen, bevor der nächste Titel den Audiokanal übernimmt. Eine vorzeitig endende aufgelöste YouTube- oder Spotify-Quelle wird an ihrer letzten Position erneut aufgelöst und fortgesetzt. Bricht Discord-Voice später ab, wird der Zustand sichtbar markiert und der Voice-Kanal automatisch mit begrenztem Rückstau erneut aufgebaut.

## Automatische Wiedergabe

Der Schalter **Automatische Wiedergabe · EIN/AUS** sitzt direkt über dem laufenden Titel.

- **Playlist-Modus:** Mehrere eigene Playlists werden in gewählter Reihenfolge endlos abgespielt.
- **Persönlicher Mix:** Der Bot lernt lokal aus tatsächlich gehörten Titeln und schlägt ähnliche Musik anderer Künstler vor.
- Auch aus vollständiger Stille startet der Mix selbstständig und hält standardmäßig zehn Titel als Puffer bereit.
- Varianten und Duplikate derselben Songfamilie werden herausgefiltert.
- Das lokale Profil speichert höchstens 200 Titel, bleibt vollständig im CT und kann einzeln oder komplett bereinigt werden.
- Beim Ausschalten wird nur die vorbereitete Warteschlange geleert; der aktuelle Titel darf zu Ende spielen.

## Dashboard und Monitoring

Oben stehen live:

- belegter Speicherplatz in Prozent
- CPU-Auslastung
- RAM-Auslastung
- Netzwerkgeschwindigkeit
- aktive Player-Instanz und Verbindungszustand

Die Monitoring-Seite zeigt CPU, RAM und Speicher mit Belegt-/Frei-Balken, die Load-Werte für 1, 5 und 15 Minuten, Container-Laufzeit, aktuellen Netzwerkdurchsatz und Gesamtverbrauch. Zusätzlich lernt ein lokaler Berater 24 Stunden lang aus CPU-Durchschnitt und -Spitzen, RAM in MB und Prozent, rechnerisch belegten CPU-Kernen sowie Download und Upload. Danach zeigt er ein gemessenes Minimum und einen optimalen CT-Wert einschließlich sicherer Bandbreitenempfehlung an. Grundlage ist der 95-Prozent-Wert mit Reserve, damit eine Drosselung nicht zu Audiostottern führt. Die feinen Messwerte bleiben auf sieben Tage begrenzt; der Netzwerkverlauf nach Tag, Monat und Jahr bleibt länger erhalten. Alles liegt ausschließlich im eigenen CT.

Unter **System** stehen außerdem der tägliche Wartungsneustart, Netzwerkverlauf nach Tag/Monat/Jahr und das sichere Dashboard-Update bereit. Vor Neustart oder Update werden Titel, Position, Lautstärke, Modus und Warteschlange gespeichert und danach wiederhergestellt. Wartungsbereinigung entfernt ausschließlich alte Upload-Zwischendateien; Ressourcenmessungen, Netzwerkverlauf und Lernprofil bleiben dauerhaft gespeichert.

## Sicherheit

- Hauptdienst ohne Root-Rechte
- Scrypt-Passwörter und gehashte, ablaufende Sitzungen
- AES-256-GCM für Discord-, Spotify- und TeamSpeak-Secrets
- serverseitige Rollen und Einzelberechtigungen
- Upload-, Such-, Login-, Player- und Downloadlimits
- Schutz vor privaten/reservierten Medienzielen und unsicheren Pfaden
- getrennt privilegierter Control-Dienst für genau definierte Systemaktionen
- fest auf dieses Repository begrenzter Updatepfad mit automatischem Rollback

## Systemanforderungen

| Bereich | Minimum | Optimal für 24/7-Betrieb |
| --- | --- | --- |
| Einsatz | ein aktiver Player und gelegentliche Dashboard-Nutzung | zwei getrennte Player, Autoplay, Spotify-Abgleich und Downloads |
| Betriebssystem | Ubuntu Server 24.04 LTS, 64-Bit, mit systemd | frischer Ubuntu-24.04-Proxmox-LXC/CT |
| Prozessor | 1 vCPU, x86-64 | 2 moderne vCPU |
| Arbeitsspeicher | 1 GB RAM; zusätzlicher Swap ist optional | 2 GB RAM |
| Speicherplatz | 8 GB CT-Speicher | mindestens 32 GB auf SSD, bei lokaler Musik entsprechend mehr |
| Netzwerk | stabil, zunächst 5 Mbit/s Download und 2 Mbit/s Upload | 10 Mbit/s Download und 5 Mbit/s Upload mit niedriger Latenz; danach am lokalen 24-Stunden-Berater ausrichten |
| Grafik | keine GPU erforderlich | keine GPU erforderlich |

Jeder eigenständige Player benötigt einen eigenen FFmpeg-Audiopfad. Gespiegelte Ausgaben teilen sich die Medienauflösung und brauchen daher weniger zusätzliche CPU-Leistung. Hochgeladene Musik und YouTube-Downloads belegen zusätzlichen Speicherplatz unter `/var/lib/musikbot187/music`. Eine Netzwerkbegrenzung sollte erst nach mindestens 24 Stunden typischer Nutzung und nie unter dem im Dashboard errechneten Minimum gesetzt werden.

## Einmal-Installation

Auf einem frischen Ubuntu-24.04-CT:

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/Musikbot187/main/install-latest.sh | sudo bash
```

Der Installer richtet Node.js 22, FFmpeg, yt-dlp, Opus, den MusikBot-Dienst und den getrennten Control-Dienst ein. Anschließend erscheinen Dashboard-Link und einmaliger Setup-Link im Terminal.

Standardpfade:

```text
/opt/musikbot187       Anwendung
/var/lib/musikbot187   Daten, Musik und verschlüsselte Einstellungen
/run/musikbot187       Control-Socket
```

### Einrichtungslink erneut anzeigen

Wurde das Konsolenfenster nach der Installation geschlossen, bevor das Hauptkonto eingerichtet wurde, kann ein neuer sicherer Einrichtungslink mit einem einzigen Befehl erzeugt werden:

```bash
sudo bash /opt/musikbot187/scripts/new-setup-link.sh
```

Der Befehl ersetzt ausschließlich den noch unbenutzten Setup-Token, startet den MusikBot neu und zeigt anschließend den neuen Link an. Sobald bereits ein Hauptadmin existiert, bricht er ohne Änderungen ab und kann deshalb kein bestehendes Konto umgehen oder zurücksetzen.

## Bestehenden CT aktualisieren

Im Dashboard **System → Update** öffnen, nach Updates suchen und die Installation bestätigen. Alternativ kann derselbe Einmal-Installer erneut ausgeführt werden; vorhandene Benutzerdaten und Einstellungen im Datenverzeichnis bleiben erhalten.

## Entwicklung und Prüfung

Benötigt werden Node.js 22 oder neuer sowie FFmpeg.

```bash
cd backend
npm ci
npm test
npm run test:first-run
npm run test:browser
npm run benchmark:player
```

Die GitHub-Prüfung läuft zusätzlich auf Ubuntu 24.04 und kontrolliert Abhängigkeiten, Backend, Browseroberfläche, Installer, native Opus-Ausgabe und den Zwei-Player-Benchmark.

## Architektur

```text
Dashboard
   ↓
Fastify-API → Auth, Rechte, verschlüsselte Secrets
   ↓
Player-Hub → Autoplay, Warteschlangen, getrennte/spiegelnde Player
   ↓
yt-dlp + FFmpeg → Discord / TeamSpeak-Verwaltung
```

Technische Prüfdetails stehen im [Deep-Audit](docs/deep-audit.md).

## Bekannte Grenze bei TeamSpeak 3

Die TS3-Seite verwaltet und diagnostiziert ServerQuery-Verbindungen. ServerQuery selbst kann keinen rohen PCM-Audiostream übertragen. Für hörbare TeamSpeak-Ausgabe ist deshalb auf dem Zielsystem zusätzlich ein echter TS3-Client-/Audio-Transport erforderlich; das Dashboard kennzeichnet eine reine ServerQuery-Verbindung bewusst nicht fälschlich als hörbare Ausgabe.
