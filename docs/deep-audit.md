# Deep-Audit – MusikBot187 5.3.0

## Prüfgegenstand

Der Stand wurde ausschließlich aus der 43-Punkte-Spezifikation neu implementiert. Alte Quellmodule wurden vor Beginn entfernt. Das frühere fragmentierte Frontend mit mehreren `fetch`-Wrappern wurde durch eine einzige API-Schicht ersetzt.

## Sicherheitsgrenzen

- Scrypt mit individuellem Salt, zeitkonstanter Setup-Token-Vergleich, zufällige gehashte Sessions und serverseitige Berechtigungen.
- AES-256-GCM für Discord-, Spotify- und TeamSpeak-Secrets; öffentliche Antworten enthalten nur `hasSecret`.
- Uploads werden gestreamt, auf 128 MiB/Datei und 10 GiB Gesamtbestand begrenzt, auf sichere Namen und bekannte Header geprüft.
- YouTube-Downloads akzeptieren nur einzelne HTTPS-Videos auf exakt erlaubten YouTube-Hosts, laufen seriell mit Zeit-, Größen- und Ratenlimit in einem isolierten Zwischenordner und werden erst nach Headerprüfung veröffentlicht. Lokale Wiedergabepfade erlauben ausschließlich Dateien im Musikstamm oder dessen festem Downloads-Unterordner.
- Medien-URLs blockieren Credentials, Loopback, private, Link-Local-, Multicast- und reservierte Ziele nach DNS-Auflösung.
- Der Hauptdienst besitzt keine Root-Rechte. Vier fest definierte Systemaktionen und der fest auf den eigenen Installer begrenzte Update-Start sind ausschließlich über den Control-Socket erreichbar. Das Dashboard kann weder eigene Befehle noch fremde Downloadadressen übergeben.
- Security-Header, deaktiviertes CORS, Body-Limit sowie getrennte Login-, Such- und Player-Limits sind aktiv.
- Der kostenlose Spotify-HTTPS-Relay erhält nur Autorisierungscode und CSRF-Status. Client-Secret, PKCE-Verifier sowie verschlüsselte Zugriffs-/Refresh-Tokens verbleiben im CT. `postMessage` ist an den serverseitig gespeicherten Ablauf und die exakte lokale Origin gebunden; der Fallback transportiert die Antwort im URL-Fragment.
- Das persönliche Autoplay-Profil bleibt im lokalen Store des CT, enthält höchstens 200 normalisierte Musiktitel und keine Spotify-, Discord- oder Benutzer-Secrets. Vierzig Langzeitfavoriten bleiben geschützt, während 160 aktuelle Plätze den Mix an Richtungsänderungen anpassen. Einzel- und Komplettbereinigung sind eigene berechtigungsgeschützte Aktionen. Ein leerer oder noch nicht konfigurierter Playlist-Modus fällt beim Einschalten kontrolliert auf den persönlichen Mix zurück und startet aus Stille.
- Spotify-Importe speichern nur Playlist-Metadaten und normalisierte Titel im CT. Der stündliche sowie manuell auslösbare Abgleich spiegelt Hinzufügungen und Löschungen, nutzt das verschlüsselte Benutzer-Zugriffstoken und lässt bei einem API-Fehler die letzte funktionierende lokale Liste unangetastet.
- Frei gewählte Bot-Namen werden normalisiert und begrenzt. Jede Verbindung erhält standardmäßig einen isolierten Player-Kontext; Zustände, Lautstärken, Warteschlangen und PCM-Daten werden anhand einer serverseitig vergebenen Instanz-ID getrennt. Der optionale Spiegelmodus löst ausschließlich auf den lokalen oder genau einen eigenständigen Player auf, verhindert Kreise und Ketten und fächert PCM serverseitig an die berechtigten Laufzeiten auf. Je Verbindungstyp werden höchstens zwei Instanzen neu zugelassen.

## Funktionsprüfung

Automatisiert geprüft werden Importierbarkeit, Setup/Login/Session, Rechte und 403-Verträge, Queue/Player-Zustand, Playlists, Settings/Theme, Secret-Redaction, Uploadheader, SSRF-Policy, Monitoring, Netzwerkaggregation, Versionsvergleich, Installer-Syntax und Systemd-Härtung. Dazu kommen Verträge für Node/EJS und `bestaudio` bei YouTube/Spotify, die Auswahl der höchsten gemeldeten Radio-Bitrate, 128-kbit/s-Opus für Discord, die „Hört …“-Aktivität, die aktuelle bigFM-URL und das explizite Betreten eines Discord-Voice-Channels. Die Audioprüfungen decken Spotify-Kandidatenwahl nach Titel und Dauer, kontinuierliche Lautstärke-Pegelrampe, Radio-Zeitausgleich und das Unterdrücken wiederholter Discord-Transportbefehle ab. Spotify-Tests prüfen App-Zugang, HTTPS-Relay, PKCE, CSRF-Zuordnung, verschlüsselte Tokens, Playlistimport sowie exakte Hinzufügungs-/Löschspiegelung. Autoplay-Tests prüfen Start aus Stille einschließlich Nullkonfigurations-Rückfall, Playlist-Reihenfolge und Endlosschleife, Zehn-Titel-Puffer, Abschalten und Leeren, Songfamilien-/Variantenfilter, Duplikatschutz, lokale Profilgewichtung und Profilgrenze sowie Eingabegrenzen und Berechtigungen. Downloadtests prüfen Host-/Pfadgrenzen, Dateinormalisierung, Downloads-Ordner und das Entfernen gelöschter Dateien aus Playlists. Wartungstests prüfen Zeitzone, Einmal-pro-Tag-Sperre, Snapshot/Wiederherstellung und die gezielte Bereinigung abgebrochener Uploadreste. Browserprüfungen decken Setup, Auth, die getrennten Seiten Instanzen/Spotify/Autoplay, Dashboard-Schalter, Playlist-Auswahl ohne Browserdialog, Spotify-Sofortabgleich, 10-Sekunden-Sprünge, Themes, kumulative automatische Suche, gespeicherte Suchquelle, Playlist-Aktionen, Laufzeit/Gesamtdauer, Diagnose-Scrollbereich, 10er-Downloadliste, Systemmenü, Statuspunkt, einklappbare Instanzen, Wartungs-Sofortlauf, Voice-Button sowie die überlaufgeschützten Netzwerk-/Update-Kacheln ab.

Zusätzlich prüfen eigene Verträge die vollständige Trennung zweier gleichzeitiger Player-Instanzen, ihre unabhängigen Lautstärken und Warteschlangen, instanzgebundenes PCM-Routing, identisches PCM-Fächern im Spiegelmodus, Wechsel zwischen Spiegel- und Eigenbetrieb, Spiegelvalidierung, Instanzgrenzen sowie das Hintergrundauflösen des nächsten Titels. Der Autoplay-Start aus Stille wird mit mehreren nacheinander verwendeten Suchrückfällen und automatischem 30-Sekunden-Neuversuch geprüft.

Der vollständige npm-Registry-Audit für Produktions- und Testabhängigkeiten meldet nach den Fastify-, Static-, Discord-, Playwright- und `tar`-Aktualisierungen null bekannte Schwachstellen. Derselbe Audit läuft künftig in der Ubuntu-CI vor den Funktionsprüfungen und stoppt eine Veröffentlichung bei neuen Funden ab Stufe „moderate“.

## Grenzen der lokalen Prüfung

Ein Windows-Entwicklungsrechner kann systemd, Ubuntu-Reboot/Poweroff, reale Discord-Voice-Verbindungen, TeamSpeak-ServerQuery sowie externe YouTube-/Spotify-/Radio-Verfügbarkeit nicht vollständig beweisen. Diese Punkte benötigen einen frischen Ubuntu-24.04-CT und echte Zugangsdaten. Der Installer führt dort vor Erfolgsausgabe einen lokalen Healthcheck aus.

## Bekannte Einschränkung

Die TS3-Verwaltung und Diagnose nutzt ServerQuery. Eine allgemeine rohe PCM-Einspeisung in TeamSpeak ist über ServerQuery selbst nicht möglich; dafür ist auf dem Zielsystem ein echter TS3-Client-/Audio-Transport erforderlich. Der aktuelle Runtime-Pfad verwaltet die Verbindung, meldet aber keine erfundene Audioausgabe als erfolgreich.
