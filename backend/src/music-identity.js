// A music uploader is not necessarily the performing artist. Prefer the song
// credit in the title, explicit artist metadata, or a YouTube Topic channel.
export function musicArtist(track){
  const clean=value=>String(value||'').normalize('NFKC').replace(/\s*-\s*Topic$/i,'').replace(/\s+/g,' ').trim().slice(0,100);
  const title=String(track?.title||'').replace(/\.(?:mp3|wav|flac|ogg|opus|m4a|aac|webm)$/i,'');
  const parts=title.split(/\s+[–—-]\s+/);
  const credited=parts.length>1?clean(parts[0]):'';
  if(credited)return credited;
  const explicit=clean(track?.artist||track?.artists?.join?.(', '));
  if(explicit&&explicit!==clean(track?.channel)&&explicit!==clean(track?.uploader))return explicit;
  const channel=String(track?.channel||track?.uploader||track?.channel_name||'');
  return /\s*-\s*Topic$/i.test(channel)?clean(channel):'';
}
