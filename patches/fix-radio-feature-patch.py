#!/usr/bin/env python3
from pathlib import Path

p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text(encoding='utf-8')
s = s.replace("if (!name || !/^https?:\\\\/\\\\//i.test(url)) throw new Error('Ungültiger Radiosender.');", "if (!name || !/^https?:\\/\\//i.test(url)) throw new Error('Ungültiger Radiosender.');")
s = s.replace("Body: { guildId: string; mode: 'off' | 'one' | 'all'; shuffle: boolean }", "Body: { playlistId?: string; mode: 'off' | 'one' | 'all'; shuffle: boolean }")
s = s.replace("s.activePlaylistId = req.body.guildId || s.activePlaylistId;", "s.activePlaylistId = req.body.playlistId || s.activePlaylistId;")
p.write_text(s, encoding='utf-8')
print('fixed radio feature patch')
