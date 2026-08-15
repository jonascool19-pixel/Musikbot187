#!/usr/bin/env python3
import json
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

CONF = Path('/etc/radiobot/radiobot.env')
ALLOWED = {
    'DISCORD_TOKEN', 'WEB_USER', 'WEB_PASSWORD', 'PORT',
    'DISCORD_CONTROL_ROLE', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET',
    'SPOTIFY_REDIRECT_URI', 'YOUTUBE_API_KEY', 'YTDLP_PATH', 'SETUP_TOKEN'
}
FIELD_MAP = {
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


def load_current() -> dict[str, str]:
    current: dict[str, str] = {}
    if CONF.exists():
        for line in CONF.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                current[key] = value.strip().strip('"').strip("'")
    return current


def write_config(current: dict[str, str]) -> None:
    lines = [f"{key}={shlex.quote(str(current.get(key, '')))}" for key in [
        'DISCORD_TOKEN', 'PORT', 'WEB_USER', 'WEB_PASSWORD',
        'DISCORD_CONTROL_ROLE', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET',
        'SPOTIFY_REDIRECT_URI', 'YOUTUBE_API_KEY', 'YTDLP_PATH', 'SETUP_TOKEN'
    ]]
    CONF.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=CONF.parent, prefix='.radiobot.env.', text=True)
    try:
        os.fchmod(fd, 0o600)
        os.write(fd, ('\n'.join(lines) + '\n').encode())
        os.close(fd)
        os.replace(tmp, CONF)
        os.chown(CONF, 0, 0)
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def main() -> int:
    try:
        raw = json.load(sys.stdin)
        if not isinstance(raw, dict):
            raise ValueError('invalid configuration')

        for ui_key, env_key in FIELD_MAP.items():
            if ui_key in raw and env_key not in raw:
                raw[env_key] = raw[ui_key]

        current = load_current()
        for key in ALLOWED:
            if key not in raw or raw[key] is None:
                continue
            value = str(raw[key])
            if '\n' in value or '\r' in value:
                raise ValueError(f'invalid value for {key}')
            if key in {'WEB_PASSWORD', 'SPOTIFY_CLIENT_SECRET', 'YOUTUBE_API_KEY', 'DISCORD_TOKEN'} and value == '' and current.get(key):
                continue
            current[key] = value

        bootstrap = bool(raw.get('bootstrapUserOnly'))
        if bootstrap:
            if current.get('WEB_PASSWORD'):
                raise ValueError('WEB_USER already configured')
            if raw.get('setupToken') != current.get('SETUP_TOKEN'):
                raise ValueError('invalid setup token')
            username = str(raw.get('webUser') or '').strip()
            password = str(raw.get('webPassword') or '')
            if not username or len(username) > 64:
                raise ValueError('invalid WEB_USER')
            if len(password) < 12:
                raise ValueError('WEB_PASSWORD must contain at least 12 characters')
            current['WEB_USER'] = username
            current['WEB_PASSWORD'] = password
        elif not current.get('DISCORD_TOKEN'):
            raise ValueError('DISCORD_TOKEN is required')

        if current.get('WEB_PASSWORD') and len(current['WEB_PASSWORD']) < 12:
            raise ValueError('WEB_PASSWORD must contain at least 12 characters')
        port = int(current.get('PORT', '3000'))
        if not 1 <= port <= 65535:
            raise ValueError('invalid PORT')
        current['PORT'] = str(port)
        if raw.get('publicUrl') and not current.get('SPOTIFY_REDIRECT_URI'):
            current['SPOTIFY_REDIRECT_URI'] = str(raw['publicUrl']).rstrip('/') + '/api/spotify/callback'

        write_config(current)
        subprocess.run(['/usr/bin/systemctl', 'restart', 'radiobot.service'], check=False)
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
