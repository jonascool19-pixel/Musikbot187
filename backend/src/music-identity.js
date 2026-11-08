import {artistNames} from './recording-identity.js';
const slowedVersionPattern=/\b(?:(?:(?:super|ultra)[\s-]*)?slowed(?:[\s-]*down)?|slow(?:er)?(?:[\s-]*(?:version|edit|remix|mix)|[\s+&-]*reverb)|(?:super|ultra)[\s-]*slow|verlangsam(?:t|te|ter|tes)|zeitlupe)\b/i;
export function musicSlowedVersion(track){
  const title=String(track?.title||'').normalize('NFKC'),parts=title.split(/\s+[–—-]\s+/),song=parts.length>1?parts.slice(1).join(' – '):title;
  return slowedVersionPattern.test(title)||/(?:[\[(]\s*slow\s*[\])]|[–—-]\s*slow\s*$)/i.test(song);
}

// A music uploader is not necessarily the performing artist. Prefer the song
// credit in the title, explicit artist metadata, or a YouTube Topic channel.
export function musicArtist(track){
  const clean=value=>String(value||'').normalize('NFKC').replace(/\s*-\s*Topic$/i,'').replace(/\s+/g,' ').trim().slice(0,100);
  const title=String(track?.title||'').replace(/\.(?:mp3|wav|flac|ogg|opus|m4a|aac|webm)$/i,'');
  const parts=title.split(/\s+[–—-]\s+/);
  // A bare song title may end in a version suffix; its prefix is not an artist.
  const metadataArtists=artistNames(track?.artists).join(', ')||track?.artist||'';
  const channelArtist=/\s*-\s*Topic$/i.test(String(track?.channel||track?.uploader||''))?clean(track.channel||track.uploader):'';
  const expectedArtists=artistNames(metadataArtists||channelArtist);
  const suffix=parts.slice(1).join(' ');
  const versionSuffix=parts.length>1&&(/^(?:(?:super|ultra)[ -]*)?(?:slowed(?:[ +&-]*reverb)?|slow|sped[ -]*up|nightcore|extended(?: mix)?|radio edit|instrumental|acoustic)$/i.test(suffix)||expectedArtists.length>0&&!/[()[\]]/.test(suffix)&&/\b(?:remix|rework|bootleg)\b/i.test(suffix));
  const credited=parts.length>1&&(!versionSuffix||expectedArtists.some(name=>clean(parts[0]).toLowerCase().includes(clean(name).toLowerCase())))?clean(parts[0]):'';
  if(credited)return credited;
  const explicit=clean(track?.artist||artistNames(track?.artists).join(', '));
  if(explicit&&explicit!==clean(track?.channel)&&explicit!==clean(track?.uploader))return explicit;
  const channel=String(track?.channel||track?.uploader||track?.channel_name||'');
  return /\s*-\s*Topic$/i.test(channel)?clean(channel):'';
}

// Count shared credits too: "A", "A feat. B" and "B & A" must not be
// treated as three unrelated artists when balancing an autoplay queue.
export function musicArtistKeys(track){
  return [...new Set(musicArtist(track).split(/\s*(?:,|&|\b(?:feat\.?|featuring|ft\.?|vs\.?)(?=\s|$)|\s[x×]\s)\s*/i)
    .map(value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}]+/gu,' ').trim())
    .filter(value=>value&&!/^(?:unknown|unbekannt|various artists?|official|music|topic)$/.test(value)))];
}
