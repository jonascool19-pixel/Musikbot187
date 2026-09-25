# Codex work status

Last updated: 2026-09-25T22:47:00.000Z
Status: in progress
Base: GitHub main b12b939; Version 1.8.36

## Currently working on
Version 1.8.37: YouTube-Altersbeschränkung, moderne yt-dlp-Clientstrategie und Schutzpausen-Recovery anhand der Produktionslogs vom 23.–25.09.2026.

## Last completed

PR #32 wurde nach vollständig erfolgreicher GitHub-CI in main gemergt. `backend/package.json` steht auf 1.8.11, sodass bestehende 1.8.10-Installationen die neue Version über **System → Update** erkennen. Die Update-Regressionstests prüfen zusätzlich, dass 1.8.10 < 1.8.11 und ein bereits aktueller 1.8.11-Server kein Phantom-Update erhält.

## Next
Altersbeschränkte Quellen als konkrete Quelle ablehnen statt Client-Schleifen; bei Spotify sauber mit dem nächsten verifizierten Treffer fortfahren; YouTube-Schutzpausen nicht durch denselben Titel endlos festhalten; Regressionstests und CI ausführen.

## Verification

Release 1.8.11: npm ci, npm audit, 185 Backendtests, Player-Performance-/native-Opus-Smoke-Test, First-Run-Test, Installer-Syntax und Dashboard-Browsertest in GitHub Actions erfolgreich. Noch keine Live-Prüfung des Crossfades auf dem Benutzer-Server.

## Safety note

This file must never contain passwords, generated temporary passwords, tokens, private logs, or personal data.
