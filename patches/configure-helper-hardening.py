#!/usr/bin/env python3
from pathlib import Path

p = Path('/usr/local/sbin/radiobot-configure')
if p.exists():
    s = p.read_text(encoding='utf-8')

    # The web setup API sends camelCase keys while the .env helper uses
    # uppercase environment names. Normalize both forms before validation.
    mapping = {
        'discordToken': 'DISCORD_TOKEN',
        'webUser': 'WEB_USER',
        'webPassword': 'WEB_PASSWORD',
        'port': 'PORT',
        'discordControlRole': 'DISCORD_CONTROL_ROLE',
        'spotifyClientId': 'SPOTIFY_CLIENT_ID',
        'spotifyClientSecret': 'SPOTIFY_CLIENT_SECRET',
        'spotifyRedirectUri': 'SPOTIFY_REDIRECT_URI',
        'youtubeApiKey': 'YOUTUBE_API_KEY',
        'ytdlpPath': 'YTDLP_PATH',
        'setupToken': 'SETUP_TOKEN',
    }
    needle = "raw=json.load(__import__('sys').stdin)\nif not isinstance(raw,dict): raise SystemExit('invalid configuration')\n"
    replacement = needle + "raw={mapping.get(k,k): v for k,v in raw.items()}\n"
    if replacement not in s and needle in s:
        s = s.replace(needle, replacement, 1)

    s = s.replace(
        "        current[key]=value\n",
        "        if key in {'WEB_PASSWORD','SPOTIFY_CLIENT_SECRET','YOUTUBE_API_KEY','DISCORD_TOKEN'} and value == '' and current.get(key):\n            continue\n        current[key]=value\n",
        1,
    )
    p.write_text(s, encoding='utf-8')
print('configure helper hardened and setup field mapping applied')
