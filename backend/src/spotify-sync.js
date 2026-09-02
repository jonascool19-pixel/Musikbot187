export const spotifyPlaylistDefaultSyncIntervalHours=24;
export const spotifyPlaylistSyncIntervalOptions=Object.freeze([1,5,12,24,48,168]);
export const spotifyPlaylistSyncCheckIntervalMs=5*60_000;

export function normalizeSpotifyPlaylistSyncInterval(value){const hours=Number(value);return spotifyPlaylistSyncIntervalOptions.includes(hours)?hours:spotifyPlaylistDefaultSyncIntervalHours;}
export function spotifyPlaylistIntervalMs(playlist){return normalizeSpotifyPlaylistSyncInterval(playlist?.spotifySyncIntervalHours)*60*60_000;}
export function spotifyPlaylistDue(playlist,now=Date.now(),intervalOverrideMs=0){const last=Date.parse(playlist?.spotifySyncCheckedAt||playlist?.spotifySyncedAt||playlist?.importedAt||'');return !Number.isFinite(last)||Number(now)-last>=Math.max(1,Number(intervalOverrideMs)||spotifyPlaylistIntervalMs(playlist));}

export const spotifyPlaylistTrackKey=track=>String(track?.id||track?.url||`${track?.source||''}:${track?.title||''}`).trim().toLocaleLowerCase('de-DE');

export function spotifyPlaylistSyncResult(playlist,imported,now=new Date().toISOString()){
  const excluded=[...new Set((Array.isArray(playlist?.spotifyExcludedTrackKeys)?playlist.spotifyExcludedTrackKeys:[]).map(value=>String(value||'').trim().toLocaleLowerCase('de-DE')).filter(Boolean))],excludedSet=new Set(excluded),previous=Array.isArray(playlist?.items)?playlist.items:[],next=(Array.isArray(imported?.items)?imported.items:[]).filter(track=>track&& !excludedSet.has(spotifyPlaylistTrackKey(track))),before=new Set(previous.map(spotifyPlaylistTrackKey).filter(Boolean)),after=new Set(next.map(spotifyPlaylistTrackKey).filter(Boolean));
  const added=[...after].filter(key=>!before.has(key)).length,removed=[...before].filter(key=>!after.has(key)).length;
  return {
    ...playlist,
    name:String(imported?.name||playlist?.name||'Spotify-Playlist').slice(0,80),
    items:next,
    source:'spotify',
    sourceUrl:imported?.sourceUrl||playlist?.sourceUrl||'',
    thumbnail:imported?.thumbnail||playlist?.thumbnail||'',
    spotifyId:imported?.spotifyId||playlist?.spotifyId||'',
    spotifyImportMode:imported?.spotifyImportMode||playlist?.spotifyImportMode||'api',
    spotifySyncEnabled:true,
    spotifyExcludedTrackKeys:excluded.slice(0,500),
    spotifySyncIntervalHours:normalizeSpotifyPlaylistSyncInterval(playlist?.spotifySyncIntervalHours),
    spotifySyncedAt:now,
    spotifySyncCheckedAt:now,
    spotifySyncError:'',
    spotifySync:{added,removed,total:next.length}
  };
}

export function spotifySyncCandidates(playlists,{dueOnly=false,now=Date.now(),intervalOverrideMs=0}={}){return (Array.isArray(playlists)?playlists:[]).filter(playlist=>playlist?.source==='spotify'&&playlist.spotifySyncEnabled!==false&&(playlist.spotifyId||playlist.sourceUrl)&&(!dueOnly||spotifyPlaylistDue(playlist,now,intervalOverrideMs)));}
