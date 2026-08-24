# MusikBot187 1.8.7

MusikBot187 1.8.7 ist der abschließend tiefengeprüfte Stand für einen Ubuntu-24.04-CT. Die Versionsnummer bleibt bewusst unverändert bei **1.8.7**.

## Abschlussverbesserungen

- Einmal-Installation nach der GitHub-Repository-Umbenennung repariert
- kürzere Update-Unterbrechung durch vorbereitete Abhängigkeiten
- automatisches Rollback bei fehlgeschlagenen Updates
- Wiederherstellung einer beschädigten Zustandsdatei aus atomarer Sicherung
- zuverlässige Erkennung einer Neuinstallation derselben Version im Dashboard
- stabilere Hintergrundfehlerbehandlung für Player, Diagnosen und Control-Dienst
- Spotify-Token-Cache sowie feste Zeitgrenzen für externe Medienanfragen
- weniger Dashboard-Flackern und weniger doppelte Monitoring-Arbeit
- erneut geprüfte Desktop- und Mobilansicht ohne horizontalen Seitenüberlauf

## Prüfung

- 78 lokale automatisierte Prüfungen bestanden
- Syntaxprüfung für Backend, Control-Dienst, Frontend und Installer
- kompletter Browserablauf sowie Desktop- und Mobilansicht geprüft
- Zwei-Player-Performanceprüfung bestanden
- Ubuntu-24.04-CI einschließlich Abhängigkeits-Audit, nativem Opus und Browserprüfung

Der Installer bewahrt Benutzerdaten und Einstellungen unter `/var/lib/musikbot187`. Ein bestehender CT kann direkt unter **System → Update** aktualisiert werden.
