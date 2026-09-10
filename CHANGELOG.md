# 📦 Änderungen

## 1.8.10 · YouTube-Schutzpause und zuverlässige Wiederverbindung

- **Warteschlange erhalten:** Bei YouTube-Bot-Prüfung oder Zugriffslimit pausieren Suche, Vorladen und Medienauflösung gemeinsam. Erneute Versuche erfolgen nach einer Minute, bei fortgesetzter Sperre mit steigenden Abständen bis zehn Minuten. Lokale Dateien und Radio bleiben unabhängig nutzbar.
- **Richtiger Titel:** Wiederverbindung und Spulen setzen auch im Zufallsmodus denselben Titel fort, statt einen anderen Song an dessen Abspielposition zu starten.
- **403-Fehler:** Bei abgewiesenen Online-Audioadressen löst der Player die Quelle neu auf. Veraltete Vorladedaten werden verworfen; Radios behalten ihre bisherige Wiederverbindung.
- **Ehrliche Meldungen:** „Wiederhergestellt“ erscheint erst, wenn tatsächlich Audiodaten ausgegeben werden. Nicht jeder Auflösungsfehler wird als 60-Sekunden-Zeitüberschreitung bezeichnet.
- **Datenschutz:** Vollständige Medienadressen werden aus Player-Diagnosen entfernt, damit Signaturen und Adressparameter nicht in neuen Protokolleinträgen landen.
- **Grenze:** Eine externe YouTube-Sperre wird dadurch nicht aufgehoben. Der Bot wartet schonend und verliert dabei keine Wartetitel; Zugangsdaten oder Cookies werden nicht automatisch übernommen.

## 1.8.9 · Mehr Künstlerwechsel, keine Slowed-Vorschläge

- **Normales Tempo:** Der persönliche Mix nimmt keine ausdrücklich als „Slowed“, „Super Slowed“, „Slow Version“ oder „verlangsamt“ bezeichneten Varianten auf. Das gilt auch für gelernte Favoriten und wiederhergestellte Autoplay-Titel. Manuelle Auswahl und der reine Playlist-Modus bleiben unverändert.
- **Auch bei Spotify:** Für persönliche Autoplay-Titel werden verlangsamte YouTube-Ersatzquellen nicht verwendet, auch nicht aus dem Auflösungscache.
- **Gemeinsame Künstlerverteilung:** Laufender Titel, vorhandene Warteschlange, gelernte Favoriten und Neuentdeckungen werden zusammen berücksichtigt. Ziel sind höchstens zwei Titel je Künstler bei zehn Wartetiteln und keine direkten Künstlerwiederholungen, sofern passende Alternativen vorliegen. Gemeinsame Künstler-Credits zählen mit.
- **Kein Suchpuffer-Stau:** Ein Vorrat voller bereits häufig vertretener Künstler verhindert neue Suchen nicht mehr. Auch spätere Treffer der begrenzten Suchseite bleiben verfügbar; der Vorrat ist weiterhin begrenzt.
- **Kleine Profile bleiben nutzbar:** Wenn beide Vorräte keine Künstleralternative bieten, wird nur die Künstlerhäufigkeit gelockert. Stilprüfung, Slowed-Filter und Sechs-Minuten-Grenze bleiben bestehen.
- **Geprüft:** Zusätzliche Regressionstests für verlangsamte Varianten, Zusammenarbeit mehrerer Künstler, stark einseitige Suchergebnisse, wiederholtes Nachfüllen und Neustart.

## 1.8.8 · Persönlicher Autoplay-Mix

- **Fünf bekannte + fünf neue:** Die Warteschlange mischt gelernte Songs direkt aus dem eigenen Musikprofil mit neuen passenden Titeln. Bei unzureichenden neuen Treffern werden verfügbare gelernte Favoriten verwendet.
- **Strengere Auswahl:** Suchpositionen und Uploadkanäle gelten nicht mehr als Nachweis für passende Künstler oder Musikrichtungen. Erkennbare Stilkonflikte werden abgewiesen.
- **Kein selbst erzeugter Geschmack:** Automatische Vorschläge erweitern das Profil erst nach bewusster Bestätigung. Alte, ausschließlich durch automatische Wiedergabe entstandene Einträge erhalten keinen positiven Geschmackseinfluss.
- **Abwechslung:** Favoriten rotieren durch die gelernte Bibliothek; neue Titel bleiben auch nach einem Neustart gegen kurzfristige Wiederholung geschützt.
- **Stilerkennung:** Up-Tempo-Schreibweisen und Hardtekk ergänzt.
- **Updates:** Versionsanzeige und Updateerkennung auf 1.8.8, Installer mit erneuter Abfrage des aktuellen Hauptzweigs und Rollback auch nach fehlgeschlagener Startprüfung.
- **Übersicht:** GitHub-Startseite neu geordnet, Funktionen und Grenzen aktualisiert, alte Audit- und Releaseberichte als Archiv gekennzeichnet.

Die Auswahl basiert auf Titel- und Künstlerangaben. Bei zehn Wartetiteln gilt die 5+5-Verteilung, wenn genügend passende, unterschiedliche Titel verfügbar sind.

Frühere Ergebnisse: [Release-Archiv 1.8.7](docs/release-v1.8.7.md).
