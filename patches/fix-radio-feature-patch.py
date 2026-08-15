#!/usr/bin/env python3
from pathlib import Path

p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text(encoding='utf-8')
s = s.replace("if (!name || !/^https?:\\\\/\\\\//i.test(url)) throw new Error('Ungültiger Radiosender.');", "if (!name || !/^https?:\\/\\//i.test(url)) throw new Error('Ungültiger Radiosender.');")
s = s.replace("Body: { guildId: string; mode: 'off' | 'one' | 'all'; shuffle: boolean }", "Body: { playlistId?: string; mode: 'off' | 'one' | 'all'; shuffle: boolean }")
s = s.replace("s.activePlaylistId = req.body.guildId || s.activePlaylistId;", "s.activePlaylistId = req.body.playlistId || s.activePlaylistId;")
s = s.replace("const state = guildState(guildId); state.queue = []; state.playing = undefined; state.playingType = undefined; state.currentPlaylist = undefined;", "const state = guildState(guildId); state.queue = []; state.playing = undefined; state.playingType = undefined; state.currentPlaylist = undefined; state.activePlaylistId = undefined; state.lastItem = undefined;")
s = s.replace("enqueue(interaction.guildId, { kind: item.kind, value: item.value, label: item.label, playlistName: 'Direkt' }, true)", "enqueue(interaction.guildId, { kind: item.kind as SourceKind, value: item.value, label: item.label, playlistName: 'Direkt' }, true)")
s = s.replace("enqueue(interaction.guildId, { kind: item.kind, value: item.value, label: item.label, playlistName: 'Direkt' })", "enqueue(interaction.guildId, { kind: item.kind as SourceKind, value: item.value, label: item.label, playlistName: 'Direkt' })")
p.write_text(s, encoding='utf-8')
print('fixed radio feature patch')
