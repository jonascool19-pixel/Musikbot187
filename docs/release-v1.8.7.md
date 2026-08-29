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
- aktueller Spotify-Playlist-Endpunkt mit Pagination und klarer Behandlung der seit Februar 2026 geltenden Eigentümer-/Mitwirkenden-Grenze
- kontogebundene Spotify-Playlist-Auswahl über `/me/playlists`, die Kontoname und importierbare Listen direkt im Dashboard anzeigt
- kanonische YouTube-Video-IDs, API-bevorzugte Suche und drei zeitlich begrenzte Clientvarianten statt gespeicherter Suchseiten
- unbrauchbare YouTube-Titel werden aus laufenden Wiederholungen entfernt; Medien-Timeouts erzeugen keine endlose Fehlerschleife mehr
- Fehler aus Browser-Erweiterungen wie `M_ID` werden nicht mehr fälschlich als Dashboardfehler gespeichert
- weniger Dashboard-Flackern und weniger doppelte Monitoring-Arbeit
- erneut geprüfte Desktop- und Mobilansicht ohne horizontalen Seitenüberlauf
- sicherer Ein-Befehl-Weg für einen verlorenen Ersteinrichtungslink
- geführte Discord-Einrichtung und serialisierter Voice-Beitritt ohne falsche Zwischenfehlermeldung
- lokaler 24-Stunden-Leistungsberater mit CPU-, RAM-, Kern-, Netzwerk- und CT-Empfehlung
- dauerhafte Messhistorien, die auch beim täglichen Wartungsneustart nicht bereinigt werden
- geglätteter FFmpeg-Netzwerkpfad und begrenzter Discord-Rückstaupuffer gegen kurze Transportaussetzer
- stotterfreierer Live-Radiopfad ohne doppelte Echtzeittaktung, mit eigenem 2-s-Discord-Vorpuffer und sauber ausgerichteten PCM-Samples
- `/play` mit echten auswählbaren Discord-Suchvorschlägen, stabilen Treffern beim Weiter-tipppen und exakter Wiedergabe der gewählten Video-ID
- `/play` liest das Feld **Suche** sowie ältere, noch von Discord gespeicherte Feldnamen zuverlässig aus und beantwortet eine tatsächlich leere Eingabe verständlich
- eigener begrenzter Player-Audiopuffer mit exakter 20-ms-Taktung und kontrolliertem Nachpuffern für YouTube, Spotify und Radio
- vollständige Playlists mit gespeicherter Wiederholung und Zufallsreihenfolge; Zufallslisten werden pro Durchlauf neu gemischt
- persönlicher Autoplay-Mix verwirft beim erneuten Start oder Moduswechsel alte Playlist-Wartetitel und Wiederholungssitzungen, lässt den aktuellen Titel weiterlaufen und füllt anschließend sofort neu
- weitere Empfehlungssuchen greifen automatisch, wenn der erste Trefferblock nur bereits gelernte Titel oder Varianten derselben Songfamilien enthält
- echte YouTube-Suchergebnis-URLs statt des auf dem Test-CT fehlgeleiteten `ytsearch10:`-Schemas; fremde yt-dlp-Konfigurationen werden ignoriert
- automatische Discord-Voice-Wiederverbindung mit sichtbarem Zustand nach einem späteren Kanalabbruch
- erwarteter Discord-Einrichtungsstatus nicht mehr als Fehlermeldung; alte Auswahlwarnung wird nach erfolgreichem Voice-Beitritt entfernt
- Warteschlangentitel per Pfeil nach oben und unten verschiebbar, ohne den laufenden Titel zu unterbrechen
- sauberer Dienstabschluss, der laufende Spotify-Abgleiche und andere Hintergrundspeicherungen vollständig abwartet
- YouTube und Spotify mit eigenem 1,5-s-/2-s-Discord-Vorpuffer, vollständig ausgespieltem Restpuffer sowie positionsgenauer Wiederaufnahme, falls eine aufgelöste Ersatzquelle vorzeitig endet
- unerwartete API-Fehler werden in der Diagnose festgehalten; Content-Security-Policy und vollständige IPv4-/IPv6-Zielprüfung wurden ergänzt
- Audit-Prüfungen sind unabhängig vom jeweils verwendeten Arbeitsordner ausführbar

## Prüfung

- 104 lokale automatisierte Prüfungen bestanden; rund 95 Prozent Backend-Zeilenabdeckung
- Syntaxprüfung für Backend, Control-Dienst, Frontend und Installer
- kompletter Browserablauf sowie Desktop- und Mobilansicht geprüft
- Zwei-Player-Performanceprüfung bestanden
- Ubuntu-24.04-CI einschließlich Abhängigkeits-Audit, nativem Opus und Browserprüfung

Der Installer bewahrt Benutzerdaten und Einstellungen unter `/var/lib/musikbot187`. Ein bestehender CT kann direkt unter **System → Update** aktualisiert werden.

## Empfohlener Ubuntu-CT

Für einen einzelnen Player reichen 1 vCPU, 1 GB RAM und 8 GB CT-Speicher. Für den zuverlässigen 24/7-Betrieb mit mehreren Funktionen werden 2 vCPU, 2 GB RAM und mindestens 32 GB SSD-Speicher empfohlen. Swap ist optional und eine GPU ist nicht erforderlich; lokale Musik und YouTube-Downloads benötigen zusätzlichen Speicherplatz.
