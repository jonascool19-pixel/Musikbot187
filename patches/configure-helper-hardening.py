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

    # Bootstrap mode creates only the first web account. A Discord token is not yet
    # available by design; normal configuration still requires it below.
    marker = "if not current.get('DISCORD_TOKEN'): raise SystemExit('DISCORD_TOKEN is required')\n"
    bootstrap = """bootstrap = bool(raw.get('bootstrapUserOnly'))\nif bootstrap:\n    if current.get('WEB_PASSWORD'):\n        raise SystemExit('WEB_USER already configured')\n    if raw.get('setupToken') != current.get('SETUP_TOKEN'):\n        raise SystemExit('invalid setup token')\n    username = str(raw.get('webUser') or '').strip()\n    password = str(raw.get('webPassword') or '')\n    if not username or len(username) > 64:\n        raise SystemExit('invalid WEB_USER')\n    if len(password) < 12:\n        raise SystemExit('WEB_PASSWORD must contain at least 12 characters')\n    current['WEB_USER'] = username\n    current['WEB_PASSWORD'] = password\nelse:\n    if not current.get('DISCORD_TOKEN'): raise SystemExit('DISCORD_TOKEN is required')\n"""
    if marker in s and "bootstrap = bool(raw.get('bootstrapUserOnly'))" not in s:
        s = s.replace(marker, bootstrap, 1)

    # Bootstrap can intentionally leave DISCORD_TOKEN empty; normal writes cannot.
    p.write_text(s, encoding='utf-8')
print('configure helper hardened: camelCase mapping + secret preservation + first-user bootstrap')
