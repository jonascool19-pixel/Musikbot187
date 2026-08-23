# Deep-Audit – MusikBot187 5.0.0

## Prüfgegenstand

Der Stand wurde ausschließlich aus der 43-Punkte-Spezifikation neu implementiert. Alte Quellmodule wurden vor Beginn entfernt. Das frühere fragmentierte Frontend mit mehreren `fetch`-Wrappern wurde durch eine einzige API-Schicht ersetzt.

## Sicherheitsgrenzen

- Scrypt mit individuellem Salt, zeitkonstanter Setup-Token-Vergleich, zufällige gehashte Sessions und serverseitige Berechtigungen.
- AES-256-GCM für Discord-, Spotify- und TeamSpeak-Secrets; öffentliche Antworten enthalten nur `hasSecret`.
- Uploads werden gestreamt, auf 128 MiB/Datei und 10 GiB Gesamtbestand begrenzt, auf sichere Namen und bekannte Header geprüft.
- Medien-URLs blockieren Credentials, Loopback, private, Link-Local-, Multicast- und reservierte Ziele nach DNS-Auflösung.
- Der Hauptdienst besitzt keine Root-Rechte. Vier fest definierte Systemaktionen sind ausschließlich über den Control-Socket erreichbar.
- Security-Header, deaktiviertes CORS, Body-Limit sowie getrennte Login-, Such- und Player-Limits sind aktiv.

## Funktionsprüfung

Automatisiert geprüft werden Importierbarkeit, Setup/Login/Session, Rechte und 403-Verträge, Queue/Player-Zustand, Playlists, Settings/Theme, Secret-Redaction, Uploadheader, SSRF-Policy, Monitoring, Installer-Syntax und Systemd-Härtung. Browserprüfungen decken Setup, Auth, Navigation, Themes und Kern-API ab.

## Grenzen der lokalen Prüfung

Ein Windows-Entwicklungsrechner kann systemd, Ubuntu-Reboot/Poweroff, reale Discord-Voice-Verbindungen, TeamSpeak-ServerQuery sowie externe YouTube-/Spotify-/Radio-Verfügbarkeit nicht vollständig beweisen. Diese Punkte benötigen einen frischen Ubuntu-24.04-CT und echte Zugangsdaten. Der Installer führt dort vor Erfolgsausgabe einen lokalen Healthcheck aus.

## Bekannte Einschränkung

Die TS3-Verwaltung und Diagnose nutzt ServerQuery. Eine allgemeine rohe PCM-Einspeisung in TeamSpeak ist über ServerQuery selbst nicht möglich; dafür ist auf dem Zielsystem ein echter TS3-Client-/Audio-Transport erforderlich. Der aktuelle Runtime-Pfad verwaltet die Verbindung, meldet aber keine erfundene Audioausgabe als erfolgreich.
