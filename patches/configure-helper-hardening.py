#!/usr/bin/env python3
from pathlib import Path

p = Path('/usr/local/sbin/radiobot-configure')
if p.exists():
    s = p.read_text(encoding='utf-8')

    # Normalize Web UI camelCase fields to the internal .env names before validation.
    old = "raw=json.load(__import__('sys').stdin)\nif not isinstance(raw,dict): raise SystemExit('invalid configuration')\n"
    new = "raw=json.load(__import__('sys').stdin)\nif not isinstance(raw,dict): raise SystemExit('invalid configuration')\nfield_map={\n    'discordToken':'DISCORD_TOKEN',\n    'webUser':'WEB_USER',\n    'webPassword':'WEB_PASSWORD',\n    'port':'PORT',\n    'discordControlRole':'DISCORD_CONTROL_ROLE',\n    'spotifyClientId':'SPOTIFY_CLIENT_ID',\n    'spotifyClientSecret':'SPOTIFY_CLIENT_SECRET',\n    'spotifyRedirectUri':'SPOTIFY_REDIRECT_URI',\n    'youtubeApiKey':'YOUTUBE_API_KEY',\n    'ytdlpPath':'YTDLP_PATH',\n    'setupToken':'SETUP_TOKEN',\n}\nfor ui_key, env_key in field_map.items():\n    if ui_key in raw and env_key not in raw:\n        raw[env_key] = raw[ui_key]\n"
    if old in s and "field_map={'discordToken':'DISCORD_TOKEN'" not in s:
        s = s.replace(old, new, 1)

    # Preserve already configured secrets when the UI deliberately sends empty fields.
    target = "        current[key]=value\n"
    replacement = "        if key in {'WEB_PASSWORD','SPOTIFY_CLIENT_SECRET','YOUTUBE_API_KEY','DISCORD_TOKEN'} and value == '' and current.get(key):\n            continue\n        current[key]=value\n"
    if target in s and replacement not in s:
        s = s.replace(target, replacement, 1)

    p.write_text(s, encoding='utf-8')
print('configure helper hardened: camelCase mapping + secret preservation')
