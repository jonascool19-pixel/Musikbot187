export const spotifyPlaylistSyncIntervalMs=60*60_000;

const trackKey=track=>String(track?.id||track?.url||`${track?.source||''}:${track?.title||''}`).trim().toLocaleLowerCase('de-DE');

export function spotifyPlaylistSyncResult(playlist,imported,now=new Date().toISOString()){
  const previous=Array.isArray(playlist?.items)?playlist.items:[],next=(Array.isArray(imported?.items)?imported.items:[]).filter(Boolean),before=new Set(previous.map(trackKey).filter(Boolean)),after=new Set(next.map(trackKey).filter(Boolean));
  const added=[...after].filter(key=>!before.has(key)).length,removed=[...before].filter(key=>!after.has(key)).length;
  return {
    ...playlist,
    name:String(imported?.name||playlist?.name||'Spotify-Playlist').slice(0,80),
    items:next,
    source:'spotify',
    sourceUrl:imported?.sourceUrl||playlist?.sourceUrl||'',
    thumbnail:imported?.thumbnail||playlist?.thumbnail||'',
    spotifyId:imported?.spotifyId||playlist?.spotifyId||'',
    spotifySyncEnabled:true,
    spotifySyncedAt:now,
    spotifySyncError:'',
    spotifySync:{added,removed,total:next.length}
  };
}

export function spotifySyncCandidates(playlists){return (Array.isArray(playlists)?playlists:[]).filter(playlist=>playlist?.source==='spotify'&&playlist.spotifySyncEnabled!==false&&(playlist.spotifyId||playlist.sourceUrl));}
