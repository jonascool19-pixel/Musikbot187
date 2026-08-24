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
- sicherer Ein-Befehl-Weg für einen verlorenen Ersteinrichtungslink
- geführte Discord-Einrichtung und serialisierter Voice-Beitritt ohne falsche Zwischenfehlermeldung
- lokaler 24-Stunden-Leistungsberater mit CPU-, RAM-, Kern-, Netzwerk- und CT-Empfehlung
- dauerhafte Messhistorien, die auch beim täglichen Wartungsneustart nicht bereinigt werden
- geglätteter FFmpeg-Netzwerkpfad und begrenzter Discord-Rückstaupuffer gegen kurze Transportaussetzer
- stotterfreierer Live-Radiopfad ohne doppelte Echtzeittaktung, mit eigenem 1-s-Discord-Vorpuffer und sauber ausgerichteten PCM-Samples
- `/play` mit echten auswählbaren Discord-Suchvorschlägen und exakter Wiedergabe der gewählten Video-ID
- erwarteter Discord-Einrichtungsstatus nicht mehr als Fehlermeldung; alte Auswahlwarnung wird nach erfolgreichem Voice-Beitritt entfernt
- Warteschlangentitel per Pfeil nach oben und unten verschiebbar, ohne den laufenden Titel zu unterbrechen
- sauberer Dienstabschluss, der laufende Spotify-Abgleiche und andere Hintergrundspeicherungen vollständig abwartet
- Spotify-Wiedergabe mit eigenem 1,5-s-Discord-Vorpuffer sowie positionsgenauer Wiederaufnahme, falls eine aufgelöste Ersatzquelle vorzeitig endet
- Audit-Prüfungen sind unabhängig vom jeweils verwendeten Arbeitsordner ausführbar

## Prüfung

- 88 lokale automatisierte Prüfungen bestanden
- Syntaxprüfung für Backend, Control-Dienst, Frontend und Installer
- kompletter Browserablauf sowie Desktop- und Mobilansicht geprüft
- Zwei-Player-Performanceprüfung bestanden
- Ubuntu-24.04-CI einschließlich Abhängigkeits-Audit, nativem Opus und Browserprüfung

Der Installer bewahrt Benutzerdaten und Einstellungen unter `/var/lib/musikbot187`. Ein bestehender CT kann direkt unter **System → Update** aktualisiert werden.

## Empfohlener Ubuntu-CT

Für einen einzelnen Player reichen 1 vCPU, 1 GB RAM und 8 GB CT-Speicher. Für den zuverlässigen 24/7-Betrieb mit mehreren Funktionen werden 2 vCPU, 2 GB RAM und mindestens 32 GB SSD-Speicher empfohlen. Swap ist optional und eine GPU ist nicht erforderlich; lokale Musik und YouTube-Downloads benötigen zusätzlichen Speicherplatz.
