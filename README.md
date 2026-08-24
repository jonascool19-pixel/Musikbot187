# MusikBot187 5.4.0

Vollständiger Neuaufbau eines selbst gehosteten Musik- und Radiobots für Ubuntu 24.04/Debian mit Web-Dashboard, YouTube, Radio-Browser, Spotify, lokalen Audiodateien, Queue, Playlists, Discord, TeamSpeak 3, Benutzerrechten, Monitoring und getrenntem privilegiertem Control-Dienst. Bei der Ersteinrichtung wird neben dem Hauptadmin ein frei wählbarer Bot-Name festgelegt; er erscheint links im Dashboard und bleibt später unter Design änderbar, während MusikBot187 die feste Produktbezeichnung ist.

Die Dashboard-Suche startet automatisch, zeigt bis zu 50 Treffer je Quelle in einem eigenen Scrollbereich und hält Titel sowie Wiedergabeaktionen ohne horizontales Verschieben sichtbar. Treffer und der aktuell laufende Titel lassen sich ohne Browserdialog direkt einer Playlist hinzufügen. Spotify-Treffer können sofort abgespielt oder in die Warteschlange übernommen werden. YouTube und die Spotify-Auflösung verwenden immer den besten verfügbaren Audiostream. Die Radiosuche bevorzugt je Sender die erreichbare Variante mit der höchsten gemeldeten Bitrate und zeigt Codec sowie Bitrate am Treffer. Discord wird mit 128-kbit/s-Opus ausgegeben und zeigt den laufenden Titel als „Hört …“-Aktivität. Discord-Instanzen können nach der Kanalauswahl gezielt einem Voice-Channel beitreten und platzsparend eingeklappt werden; Diagnosemeldungen zeigen drei Einträge kompakt, bleiben scrollbar und lassen sich mit einem Klick kopieren.

Die Wiedergabe zeigt Laufzeit und – soweit von der Quelle bekannt – Gesamtdauer. Spotify-Titel werden vor der Wiedergabe mit mehreren YouTube-Kandidaten abgeglichen; Titelähnlichkeit und tatsächliche Dauer verhindern möglichst, dass eine kurze Edit-, Cover- oder Remixfassung gewählt wird. Überschreitet eine laufende Quelle dennoch ihre Metadatenangabe, zählt die Laufzeit weiter und kennzeichnet den alten Wert als Quellenangabe. Radio erscheint eindeutig als Live-Stream. Die Titellaufschrift bewegt sich immer und bleibt in Geschwindigkeit, Text- und Hintergrundfarbe einstellbar. Während ein Titel läuft, löst der Player den nächsten Wartelisteneintrag bereits im Hintergrund auf, damit der Wechsel ohne die sonst übliche YouTube-/Spotify-Vorbereitungszeit starten kann. Lautstärkeänderungen werden als kurze PCM-Pegelrampe angewendet, damit keine harten Signalsprünge entstehen. Radio erhält zusätzlich einen größeren Discord-Puffer und einen FFmpeg-Zeitausgleich gegen kurze Netzwerk- und Zeitstempellücken. Für den 24/7-Betrieb startet systemd den Dienst auch nach einem unerwarteten sauberen Prozessende neu. Zusätzlich kann im Dashboard ein täglicher Wartungsneustart in der Zeitzone Europe/Berlin aktiviert oder über „Jetzt ausführen“ getestet werden; Titel, Position, Lautstärke, Modus und Warteschlange werden vorher gespeichert und anschließend automatisch wiederhergestellt.

Die Auswahl oben ist eine Player-Instanz statt eines globalen Ausgabeschalters. Der lokale Player sowie jede Discord-/TS3-Konfiguration besitzen standardmäßig einen getrennten Titel, eigene Lautstärke und eigene Warteschlange. Alternativ kann eine Instanz den lokalen oder einen anderen eigenständigen Player spiegeln; dann erhalten beide Ausgänge denselben PCM-Audiostream und alle Befehle steuern dieselbe Wiedergabe. Spiegelketten und Kreise werden serverseitig verhindert. Zum Schutz der CPU- und RAM-Ressourcen eines Ubuntu-CT sind jeweils höchstens zwei Discord- und zwei TS3-Instanzen erlaubt. Ein Klick auf eine Instanz links lädt genau deren Player oder Spiegelquelle ins Dashboard; laufende andere Instanzen spielen weiter. TeamSpeak ServerQuery selbst überträgt kein Audio; deshalb bleibt eine TS3-Instanz orange gekennzeichnet, bis ein echter TS3-Client-/Audio-Transport ergänzt ist, und wird nicht fälschlich als hörbare grüne Ausgabe dargestellt.

Die frühere Sammelseite **Einstellungen** wurde vollständig aufgeteilt: **Instanzen** enthält ausschließlich Discord- und TeamSpeak-Konfigurationen, während Spotify einen eigenen Navigationspunkt besitzt. **Automatische Wiedergabe** ist ebenfalls eine eigenständige Seite. Dort können mehrere Playlists in einer sichtbaren Reihenfolge ausgewählt und endlos im Kreis abgespielt werden. Alternativ erstellt der persönliche Musikmix aus dem aktuellen Titel und der lokalen Hörhistorie abwechslungsreiche YouTube-Vorschläge, verwirft Dubletten und Varianten derselben Songfamilie und bevorzugt andere Künstler aus einer passenden Stilrichtung. Auch aus vollständiger Stille startet der Mix selbstständig und hält standardmäßig zehn Titel als Puffer bereit. Ein Titel wird erst nach ungefähr 30 Sekunden tatsächlicher Wiedergabe in das lokale Profil aufgenommen. Das Profil bleibt ausschließlich im CT, schützt 40 häufig gehörte Langzeitfavoriten und nutzt 160 Plätze für die aktuelle Richtung. Es zeigt zwei Titel kompakt, hält den Rest in einer aufklappbaren Scrollliste und erlaubt das einzelne Entfernen oder vollständige Zurücksetzen.

Der Schalter **Automatische Wiedergabe · EIN/AUS** sitzt direkt über dem laufenden Titel. Beim Einschalten wird die Warteschlange nach der gespeicherten Konfiguration gefüllt und anschließend laufend ergänzt. Ist noch keine abspielbare Playlist gewählt, startet der persönliche Musikmix automatisch aus dem Leerlauf, probiert mehrere allgemeine YouTube-Startmischungen als Rückfall und hält zehn Titel als Puffer bereit. Leere oder vorübergehend fehlgeschlagene Suchen werden nach 30 Sekunden automatisch wiederholt und der konkrete Zustand steht direkt am Schalter. Beim Ausschalten wird nur die wartende Liste geleert; der aktuelle Titel darf zu Ende spielen. **Stop** beendet zusätzlich Autoplay. Radiosender werden nicht in das Hörprofil aufgenommen, da ein fortlaufender Stream keinen zuverlässig abgegrenzten Einzeltitel liefert.

Importierte Spotify-Playlists bleiben mit ihrer Spotify-ID verknüpft. Pro Playlist lässt sich der automatische Abgleich auf 1, 5, 12, 24, 48 Stunden oder wöchentlich einstellen; Standard sind ressourcenschonende 24 Stunden. MusikBot187 übernimmt neue Titel und entfernt Titel, die bei Spotify nicht mehr enthalten sind. Fällige Listen werden auch nach einem Neustart erkannt. Ein fehlgeschlagener Versuch lässt die letzte funktionierende lokale Liste und den Zeitpunkt des letzten erfolgreichen Abgleichs unangetastet. In jeder verknüpften Playlist steht zusätzlich **Jetzt mit Spotify abgleichen** für einen sofortigen manuellen Lauf bereit.

Spotify verwendet zwei getrennte Freigaben: Client-ID und Client-Secret reichen für Suche, Wiedergabe und Warteschlange. Nur der Playlist-Import benötigt einmalig eine Spotify-Benutzerfreigabe. Dafür stellt das Projekt kostenlos die feste HTTPS-Rückrufadresse `https://jonascool19-pixel.github.io/radiobot/spotify-callback/` über GitHub Pages bereit. Diese Adresse muss einmal exakt im Spotify Developer Dashboard als Redirect URI eingetragen werden; eine eigene Domain, ein Zertifikat oder ein kostenpflichtiger Tunnel sind nicht nötig. Der Relay sieht weder Client-Secret noch PKCE-Schlüssel noch Zugriffstokens. Er übermittelt nur den kurzlebigen Autorisierungscode an das bereits geöffnete lokale Dashboard; fällt die Fensterverbindung aus, erfolgt der Rückweg über ein URL-Fragment, das nicht an den lokalen HTTP-Server übertragen wird. Zugriffs- und Aktualisierungstoken werden ausschließlich verschlüsselt im CT gespeichert und automatisch erneuert.

Unter **Dateien** können einzelne YouTube-Links in bester verfügbarer Audioqualität heruntergeladen werden. Sie landen im aufklappbaren Ordner **Downloads**, der ab zehn Einträgen einen eigenen Scrollbereich erhält. Downloads können abgespielt, zur Warteschlange oder zu Playlists hinzugefügt und einzeln oder gesammelt gelöscht werden.

Unter **System → Netzwerk** zeigt das Dashboard Download und Upload live sowie die empfangenen und gesendeten Gesamtmengen seit dem letzten Start des Containers beziehungsweise der Netzwerkschnittstelle. Ein dauerhaft gespeicherter Verlauf fasst Empfang, Versand und Gesamtverbrauch nach Tag, Monat und Jahr zusammen. Die Update-Kachel prüft die Version im festen offiziellen GitHub-Repository und installiert neue Stände mit einem bestätigten Klick; Wiedergabe und Warteschlange werden vorher gesichert, der Wiederanlauf im Dashboard überwacht und bei einem Installationsfehler automatisch die vorherige Version wiederhergestellt. Der überall sichtbare Systemknopf öffnet vier bestätigungspflichtige Aktionen; neben der Ausgabe zeigt ein grüner, orangefarbener oder roter Punkt den aktuellen Verbindungszustand.

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
npm run benchmark:player
```

## Architektur

`frontend` → Fastify-API → Store/Auth/Permissions → Autoplay/Player → yt-dlp/FFmpeg → Discord/TS3. Für die aktuelle YouTube-Challenge-Auflösung nutzt yt-dlp Node.js 22 und die offizielle EJS-Komponente. Direkte Medienziele werden gegen private und reservierte Netze geprüft. Secrets werden mit AES-256-GCM verschlüsselt. Systemaktionen laufen ausschließlich über `/run/musikbot187/control.sock`.

Weitere Details und offene Umgebungsprüfungen stehen in [docs/deep-audit.md](docs/deep-audit.md).
