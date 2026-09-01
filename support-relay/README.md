# MusikBot187 Support Relay

Diese kleine zentrale Empfangsstelle nimmt freiwillig gesendete, bereits bereinigte MusikBot187-Fehlerberichte an und leitet sie an genau einen privaten Discord-Kanal des Projekteigentümers weiter.

Der Discord-WebHook darf niemals in MusikBot187, einer Installationsdatei oder im GitHub-Repository stehen. Er wird beim bereitgestellten Cloudflare Worker einmalig als verschlüsseltes Secret `DISCORD_WEBHOOK_URL` hinterlegt. Anschließend wird die öffentliche `/reports`-Adresse des Workers als `MUSIKBOT187_BUG_REPORT_RELAY_URL` in MusikBot187 gesetzt. Die Empfängeradresse ist nicht geheim; der Discord-WebHook bleibt ausschließlich im Worker.

Bereitstellung:

1. Im privaten Discord-Supportkanal einen WebHook anlegen.
2. In diesem Ordner `npx wrangler secret put DISCORD_WEBHOOK_URL` ausführen und die WebHook-Adresse interaktiv eingeben.
3. Mit `npx wrangler deploy` bereitstellen.
4. Die ausgegebene HTTPS-Adresse mit dem Pfad `/reports` als `MUSIKBOT187_BUG_REPORT_RELAY_URL` eintragen.

Die Empfangsstelle begrenzt Berichte, akzeptiert höchstens drei Medienanhänge, unterbindet Discord-Erwähnungen und bereinigt Text ein zweites Mal. Cloudflares Rate-Limit-Bindung schützt zusätzlich vor einer Berichtflut.
