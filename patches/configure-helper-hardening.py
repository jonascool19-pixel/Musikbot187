#!/usr/bin/env python3
from pathlib import Path
p=Path('/usr/local/sbin/radiobot-configure')
if p.exists():
    s=p.read_text(encoding='utf-8')
    s=s.replace("        current[key]=value\n","        if key in {'WEB_PASSWORD','SPOTIFY_CLIENT_SECRET','YOUTUBE_API_KEY','DISCORD_TOKEN'} and value == '' and current.get(key):\n            continue\n        current[key]=value\n",1)
    p.write_text(s,encoding='utf-8')
print('configure helper hardened')
