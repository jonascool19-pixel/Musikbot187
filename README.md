# 🎵 MusikBot187

**Deine Musik. Dein Dashboard. Dein Server.**

Ein selbst gehosteter Musik- und Radiobot für Ubuntu 24.04 mit Discord-Audio, Playlists, lokalen Dateien und einem persönlichen Autoplay-Profil.

[![CI](https://github.com/jonascool19-pixel/Musikbot187/actions/workflows/ci.yml/badge.svg)](https://github.com/jonascool19-pixel/Musikbot187/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/Version-1.8.8-blue)
![Ubuntu](https://img.shields.io/badge/Ubuntu-24.04_LTS-E95420?logo=ubuntu&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)

[🚀 Installation](#installation) · [✨ Funktionen](#funktionen) · [🎧 Autoplay](#autoplay) · [🔄 Updates](#updates) · [🐞 Support](#support) · [📦 Änderungen](CHANGELOG.md)

---

<a id="installation"></a>
## 🚀 In wenigen Minuten startklar

Auf einem **Ubuntu-24.04-Server oder Proxmox-LXC/CT mit systemd** ausführen:

```bash
sudo apt update && sudo apt upgrade -y && sudo apt install -y curl && curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/Musikbot187/main/install-latest.sh | sudo bash
```

Der Einzeiler lädt den Installer aus dem aktuellen **`main`-Zweig**. Die Installation verwendet ebenfalls diesen Zweig und enthält damit die dort veröffentlichten Fehlerkorrekturen. Ein älteres Release-Archiv muss nicht heruntergeladen werden.

1. **Installieren:** Node.js, FFmpeg, yt-dlp, Opus und die Systemdienste werden eingerichtet.
2. **Dashboard öffnen:** Dashboard-Adresse und einmaliger Einrichtungslink erscheinen im Terminal.
3. **Hauptadmin anlegen:** Der Assistent führt durch Konto, optionales Backup, erste Verbindung und Design.
4. **Musik starten:** Discord verbinden, Titel suchen oder eine eigene Playlist öffnen.

<details>
<summary>🔗 Einrichtungslink verloren?</summary>

Solange noch kein Hauptadmin eingerichtet ist, erzeugt dieser Befehl einen neuen Link:

```bash
sudo bash /opt/musikbot187/scripts/new-setup-link.sh
```

Er ersetzt den unbenutzten Einrichtungslink und startet den Bot neu. Bereits eingerichtete Konten werden dadurch nicht zurückgesetzt.

</details>

### Was dein Server braucht

| | Einstieg | Empfehlung |
| --- | --- | --- |
| Betriebssystem | Ubuntu 24.04 LTS, 64-Bit, systemd | Frischer Ubuntu-24.04-LXC/CT |
| CPU | 1 vCPU, x86-64 | 2 moderne vCPU |
| RAM | 1 GB | 2 GB |
| Speicher | 8 GB | 32 GB auf SSD, mehr bei eigener Musik |
| Netzwerk | Stabile Verbindung | Ausreichend Reserve für Downloads und Discord-Audio |

Eine Grafikkarte ist nicht nötig. Der integrierte Ressourcenberater ermittelt nach 24 Stunden typischer Nutzung passendere CPU-, RAM- und Netzwerkempfehlungen für deinen Betrieb.

<a id="funktionen"></a>
## ✨ Das kann MusikBot187

| Bereich | Funktionen |
| --- | --- |
| 🔎 **Musik finden** | YouTube, Spotify-Metadaten, Radio-Browser, direkte Streams und lokale Audiodateien |
| ▶️ **Musik steuern** | Play, Pause, Weiter, Skip, Stop, Lautstärke und Spulen bei einzelnen Titeln |
| 📋 **Warteschlange** | Titel hinzufügen, entfernen und mit Pfeilen umsortieren; der Player folgt der angezeigten Reihenfolge |
| 🗂️ **Playlists** | Scrollbare Bibliothek, eigenes Playlist-Fenster, Titelsuche, einzelne Titel abspielen oder löschen, Wiederholung und Zufall |
| 🎧 **Autoplay** | Ausgewählte Playlists endlos abspielen oder bekannte Favoriten mit neuen Vorschlägen verbinden |
| 💬 **Discord** | Bis zu zwei Bots mit getrennten Playern oder synchroner Audioausgabe und Slash-Befehlen |
| 💾 **Eigene Musik** | Audiodateien hochladen, einzelne YouTube-Audiospuren herunterladen und Dateien verwalten |
| 👥 **Benutzer** | Hauptadmin, Administratoren, einzelne Berechtigungen und geschützter Erstlogin |
| 🎨 **Dashboard** | 17 Designs, eigene Akzentfarbe, einklappbare Bereiche und mobile Ansicht |
| 🔔 **Benachrichtigungen** | Fehler- und Updatehinweise, einzelne Einträge oder alle gemeinsam lesen und löschen |
| 📊 **Betrieb** | Monitoring, Netzwerkverlauf, Ressourcenberater, verschlüsselte Backups und Dashboard-Updates |
| 🐞 **Support** | Fehler mit Beschreibung, optionalen Bildern/Videos und bereinigter Diagnose melden |

**Spotify liefert Titel- und Playlistdaten.** Für die Audioausgabe sucht der Bot eine passende YouTube-Quelle; er streamt keine Spotify-Audiodateien.

**TeamSpeak 3 ist als ServerQuery-Verwaltung enthalten.** Bis zu zwei Verbindungen lassen sich verwalten und diagnostizieren. Hörbare TS3-Ausgabe benötigt einen zusätzlichen echten TS3-Client-/Audio-Transport. Der lokale Player allein ist ebenfalls keine Lautsprecher- oder Browser-Audioausgabe.

### 🔎 Suche und Playlists

Die automatische Suche beginnt ab zwei Zeichen und sammelt bis zu 150 eindeutige Treffer in einer eigenen Scrollliste. Die gewählte Quelle bleibt gespeichert. Treffer können direkt starten, in die Warteschlange oder in eine Playlist übernommen werden.

Über **Playlist öffnen** erscheint ein eigenes Fenster mit scrollbarer Titelliste und Suchfeld. Neben den einzelnen Titeln stehen Abspielen und Löschen bereit. Ganze Playlists unterstützen gespeicherte Wiederholung und Zufallsreihenfolge; bei jedem vollständigen Zufallsdurchlauf wird neu gemischt.

Lokale Musik und YouTube-Downloads haben eigene Verwaltungsbereiche. Unterstützte Uploadformate sind MP3, WAV, FLAC, OGG, Opus, M4A, AAC und WebM. Der Standard begrenzt Uploads auf 128 MiB pro Datei und den lokalen Musikbestand auf 10 GiB.

<a id="autoplay"></a>
## 🎧 Automatische Wiedergabe, die zu dir passt

Es gibt zwei Betriebsarten:

| Modus | Verhalten |
| --- | --- |
| **Aus Playlists** | Die ausgewählten Playlists laufen in der festgelegten Reihenfolge als Endlosschleife. |
| **Persönlicher Mix** | Bekannte Favoriten aus deinem Lernprofil und passende Neuentdeckungen bilden gemeinsam die Warteschlange. Standardmäßig werden zehn Titel vorbereitet. |

So richtest du deinen persönlichen Mix ein:

1. Unter **Dein lokales Musikprofil → Aus Playlists lernen** die gewünschten Playlists auswählen und analysieren.
2. **Gewünschte Musikrichtungen** und **Gewünschte Künstler** bei Bedarf getrennt ergänzen. Die Eingabe bietet geprüfte Vorschläge.
3. Die erkannten **Stilrichtungen und Künstler** im Profil kontrollieren. Unerwünschte Begriffe lassen sich sperren; einzelne Titel oder ganze Playlists können vom Lernen ausgeschlossen werden.
4. Mit **Mehr davon**, **Weniger davon** und deinem Hörverhalten den Geschmack weiter anpassen. Bewusst gehörte Titel, ausgewählte Lern-Playlists und deine Bewertungen prägen das Profil. Automatische Vorschläge erzeugen durch bloßes Zu-Ende-Spielen keinen neuen Musikgeschmack.

**Der Mix zielt auf fünf bekannte und fünf neue Titel pro zehn Wartetitel.** Bekannte Songs kommen direkt aus deinem Lernprofil und wechseln sich ab. Neue Songs benötigen passende Künstler- oder Stilbelege; ihre Position in der YouTube-Suche genügt nicht. Falls geprüfte Neuentdeckungen fehlen, ergänzen verfügbare gelernte Favoriten den Mix. Bei zu wenigen passenden Titeln kann die Warteschlange kürzer bleiben.

Das Profil bleibt im eigenen Container und umfasst höchstens **200 Titel**. 40 häufig gehörte Langzeitfavoriten werden geschützt, während 160 Plätze aktuelle Vorlieben aufnehmen.

Für den persönlichen Mix gilt eine **Sechs-Minuten-Grenze**. Er filtert außerdem erkennbare Tutorials, Podcasts, Sammlungen, lange Sets, gesperrte Begriffe und doppelte Songvarianten. Die Erkennung verwendet Titel- und Künstlerdaten; sie ist keine akustische Analyse der Audiodatei.

### 💬 Discord verbinden

1. Unter **Instanzen** Name, Bot-Token und Client-ID/Bot-ID speichern.
2. **Bot zu Discord hinzufügen** öffnen und den gewünschten Server auswählen.
3. Die Kanalübersicht mit **↻** aktualisieren.
4. Server und Voice-Channel auswählen, anschließend **Voice-Channel betreten**.

Der laufende Titel erscheint als „Hört …“-Aktivität. Die Bots können unabhängig spielen oder denselben Player spiegeln. Verbindungsabbrüche werden angezeigt und mit begrenzten automatischen Wiederverbindungsversuchen behandelt.

| Befehl | Aktion |
| --- | --- |
| `/play` | Titel suchen und mit auswählbaren YouTube-Treffern hinzufügen |
| `/pause` · `/resume` | Wiedergabe pausieren oder fortsetzen |
| `/skip` · `/stop` | Titel überspringen oder Wiedergabe stoppen |
| `/queue` · `/clear` | Warteschlange anzeigen oder leeren |
| `/volume` | Lautstärke ändern |
| `/nowplaying` · `/help` | Laufenden Titel oder Hilfe anzeigen |

### 🟢 Spotify verbinden

Spotify-Suche benötigt eine eigene Spotify-App mit Client-ID und Client-Secret. Für die persönliche Playlistbibliothek wird zusätzlich das Spotify-Konto verbunden.

In der Spotify-App diese Redirect-Adresse hinterlegen:

```text
https://jonascool19-pixel.github.io/Musikbot187/spotify-callback/
```

Eine eigene Domain oder ein Tunnel ist dafür nicht nötig. Der Rückweg verarbeitet einen kurzlebigen Autorisierungscode; Client-Secret und Zugriffstokens bleiben im Container.

Unter **Playlists → Spotify-Playlists laden** stehen erreichbare Listen zur Auswahl; ein direkter Playlist-Link ist ebenfalls möglich. Welche Listen zugänglich sind, hängt von den Spotify-Freigaben des verbundenen Kontos ab. Für öffentlich eingebettete Playlists gibt es einen begrenzten Metadaten-Rückfall.

Importierte Listen bleiben verknüpft. Der Abgleich spiegelt hinzugefügte und entfernte Titel automatisch nach **1, 5, 12, 24 oder 48 Stunden** beziehungsweise **wöchentlich** und kann jederzeit manuell gestartet werden.

## 👥 Benutzer und Sicherheit

- **Geschütztes Hauptkonto:** Benutzerrollen und Einzelberechtigungen werden serverseitig geprüft.
- **Sicherer Erstlogin:** Neue Konten erhalten ein zufällig erzeugtes Einmal-Passwort. Es wird beim Anlegen angezeigt und muss sicher weitergegeben werden. Vor der ersten Dashboard-Nutzung ist ein eigenes Passwort Pflicht.
- **Übersichtliche Verwaltung:** Jeder Benutzer hat eine einzeln aufklappbare Karte.
- **Geschützte Zugangsdaten:** Passwörter werden mit Scrypt gehasht; Verbindungs-Secrets sind mit AES-256-GCM verschlüsselt.
- **Begrenzte Systemrechte:** Der Musikdienst läuft ohne Root-Rechte. Ein getrennter Control-Dienst führt fest definierte Systemaktionen aus.
- **Schutz im Betrieb:** Ablaufende Sitzungen, Anfrage- und Uploadlimits sowie Prüfungen von Medienzielen und Dateipfaden.

<a id="support"></a>
## 🐞 Einen Fehler melden

Rechts neben der Benachrichtigungsglocke befindet sich **Bug melden**. Wähle einen Bereich und beschreibe, was passiert ist und wie sich der Fehler auslösen lässt.

- **Mit Medien:** Bis zu drei Bilder oder kurze Videos, jeweils höchstens 8 MiB.
- **Ohne Medien:** **Keine Bilder oder Videos vorhanden** auswählen.
- **Mit Diagnose:** Nach Zustimmung werden Version, Dashboard-Bereich und höchstens 20 relevante Logeinträge ergänzt. Zugangsdaten, WebHook-Adressen, E-Mail-Adressen und IPs werden vor dem Versand bereinigt.
- **Nach dem Versand:** Das Fenster bestätigt den Eingang mit einer Vorgangsnummer.

Die Standardkonfiguration sendet freiwillig abgeschickte Berichte aller Installationen an die zentrale Support-Empfangsstelle des Projekts. Diese leitet sie an den privaten Discord-Supportkanal des Projekteigentümers weiter. Der Discord-WebHook liegt ausschließlich als Secret in der Empfangsstelle.

Bilder und Videos werden nicht automatisch anonymisiert; prüfe vor dem Anhängen, was darauf sichtbar ist. Normale Benutzer dürfen einen Bericht senden, erhalten dadurch aber keinen Zugriff auf die vollständigen Systemprotokolle.

Die technische Einrichtung der zentralen Empfangsstelle ist in [support-relay/README.md](support-relay/README.md) beschrieben.

## 📊 Monitoring und Sicherungen

Das Dashboard zeigt CPU, RAM, Speicherplatz, Netzwerkdurchsatz und Player-Verbindungen live. Die Monitoring-Seite ergänzt Verlauf, Container-Laufzeit und den lokalen 24-Stunden-Ressourcenberater. Netzwerkverbrauch ist nach Tag, Monat und Jahr einsehbar.

**Verschlüsselte Backups** enthalten Einstellungen, Playlists, Musikprofil, lokale Musik, weitere Benutzer, Verbindungen und Messwerte. Hauptadmin und aktive Sitzungen werden nicht exportiert. Das mindestens zehn Zeichen lange Backup-Passwort wird zur Wiederherstellung benötigt.

Ein optionaler täglicher Wartungsneustart speichert Wiedergabe, Position und Warteschlange für den Wiederanlauf. Begrenzte Audiopuffer, die Vorbereitung des nächsten Titels und Wiederverbindungsversuche helfen bei kurzen Unterbrechungen.

<a id="updates"></a>
## 🔄 Auf dem aktuellen Stand bleiben

Im Dashboard **System → Update** öffnen, nach Updates suchen und das Update starten. Alternativ den Installations-Einzeiler erneut ausführen.

Beide Wege beziehen die Anwendung aus diesem Repository. Die Installation bereitet Abhängigkeiten vor dem Dienstwechsel vor und besitzt einen Rückweg zur vorherigen Installation, falls das Umschalten fehlschlägt. Einstellungen und Musik liegen getrennt von den Anwendungsdateien:

| Pfad | Inhalt |
| --- | --- |
| `/opt/musikbot187` | Anwendung |
| `/var/lib/musikbot187` | Einstellungen, Daten und Musik |
| `/run/musikbot187` | Lokaler Control-Socket |

Die aktuelle Entwicklung liegt auf [main](https://github.com/jonascool19-pixel/Musikbot187/tree/main). Ob die automatischen Prüfungen erfolgreich waren, zeigt der CI-Status oben.

## 🛠️ Projektstruktur und Entwicklung

| Ordner | Aufgabe |
| --- | --- |
| `frontend/` | Dashboard, Gestaltung und Browserbedienung |
| `backend/` | API, Player, Autoplay, Integrationen und Abhängigkeiten |
| `control/` · `systemd/` | Systemsteuerung und Linux-Dienste |
| `tests/` | Automatisierte Funktions- und Sicherheitsprüfungen |
| `scripts/` | Einrichtungslink und dauerhafter Arbeitsstand |
| `support-relay/` | Zentrale Empfangsstelle für Fehlerberichte |
| `docs/` | Spotify-Rückweg und historische Projektdokumentation |

Für die Entwicklung werden **Node.js 22 oder neuer** und **FFmpeg** benötigt:

```bash
cd backend
npm ci
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run benchmark:player
```

Die [GitHub-Prüfung](https://github.com/jonascool19-pixel/Musikbot187/actions/workflows/ci.yml) kontrolliert unter Ubuntu 24.04 Abhängigkeiten, Funktionen, Browseroberfläche, Installer-Syntax und native Opus-Verarbeitung.

Frühere Ergebnisse bleiben nachvollziehbar: [Auditarchiv 1.8.7](docs/deep-audit.md) · [Release-Archiv 1.8.7](docs/release-v1.8.7.md). Diese Archive beschreiben ihren damaligen Stand; die aktuelle Funktionsübersicht steht auf dieser Seite.
