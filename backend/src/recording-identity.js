// Recording identity is independent of recommendation policy and provider URLs.
export const identityText=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ß/g,'ss').replace(/[øØ]/g,'o').replace(/[łŁ]/g,'l').toLowerCase().replace(/[^\p{L}\p{N}*#]+/gu,' ').trim().replace(/\s+/g,' ').slice(0,500);
export const artistName=value=>typeof value==='string'?value:String(value?.name||'');
export function artistNames(value){
  if(Array.isArray(value))return value.slice(0,20).map(artistName).filter(Boolean);
  return String(value||'').slice(0,2000).split(/\s*(?:,|;|&|\+|\bfeat(?:uring)?\.?\s|\bft\.?\s|\s[x×]\s)\s*/iu).map(name=>name.trim()).filter(Boolean).slice(0,20);
}
const patterns={
  remix:/\bremix\b/iu,rework:/\brework\b/iu,bootleg:/\bbootleg\b/iu,
  extended:/\bextended\b/iu,radio:/\bradio\s+(?:edit|mix|version)\b/iu,edit:/\bedit\b/iu,
  live:/\blive\b/iu,acoustic:/\b(?:acoustic|unplugged|akustik)\b/iu,
  instrumental:/\binstrumental\b/iu,karaoke:/\bkaraoke\b/iu,cover:/\bcover\b/iu,
  slowed:/\b(?:(?:(?:super|ultra)[\s-]*)?slowed(?:[\s-]*down)?|slow(?:er)?(?:[\s-]*(?:version|edit|remix|mix)|[\s+&-]*reverb)|(?:super|ultra)[\s-]*slow|verlangsam\w*|zeitlupe)\b/iu,
  sped:/\b(?:sped[\s-]*up|speed[\s-]*up|beschleunigt)\b/iu,nightcore:/\bnightcore\b/iu,
  remaster:/\bremaster(?:ed)?\b/iu,mono:/\bmono\b/iu,stereo:/\bstereo\b/iu
};
const decoration=/^(?:(?:official|music|hd|hq|4k)\s+)*(?:audio|video(?:clip)?|lyrics?|visuali[sz]er)(?:\s+(?:official|hd|hq|4k))*$/iu;
export function recordingIdentity(track={}){
  const structured=artistNames(track.artists),raw=String(track.trackTitle||track.songTitle||track.title||'').trim();
  const parts=raw.split(/\s+[–—-]\s+/u);
  let artists=structured.length?structured:artistNames(track.artist),song=raw;
  if(!track.trackTitle&&!track.songTitle&&parts.length>1){
    const prefix=identityText(parts[0]);
    const channelName=identityText(String(track.channel||track.uploader||'').replace(/\s*-\s*Topic$/iu,''));
    const suffixOnly=/^(?:(?:super|ultra)[ -]*)?(?:slowed(?:[ +&-]*reverb)?|sped[ -]*up|nightcore|extended(?: mix)?|original mix|radio edit|live|acoustic|instrumental|slow)$/iu.test(parts.slice(1).join(' '));
    const knownPrefix=artists.some(name=>prefix.includes(identityText(name)))||prefix===channelName;
    const suffixVersion=!/[()[\]]/.test(parts.slice(1).join(' '))&&Object.values(patterns).some(pattern=>pattern.test(parts.slice(1).join(' ')));
    if(knownPrefix||!suffixOnly&&!(suffixVersion&&artists.length&&!knownPrefix)){
      artists=artistNames(parts[0]);
      song=parts.slice(1).join(' – ');
    }

  }
  const channel=String(track.channel||track.uploader||'').replace(/\s*-\s*Topic$/iu,'').replace(/\s+Official(?:\s+YouTube)?\s+Channel$/iu,'').trim();
  const sections=[...song.matchAll(/[\[(]([^\])]+)[\])]/gu)].map(match=>match[1]);
  const suffix=song.split(/\s+[–—-]\s+/u).slice(1);
  const versionText=[...sections,...suffix,String(track.version||'')].join(' ');
  const flags=Object.entries(patterns).filter(([key,pattern])=>pattern.test(versionText)||key!=='live'&&key!=='cover'&&pattern.test(song)).map(([key])=>key);
  if(/\blive$/iu.test(song.trim()))flags.push('live');
  if(/\bcover$/iu.test(song.trim()))flags.push('cover');
  if(/(?:^|[\s(\[-])slow(?:[)\]]|$)/iu.test(versionText)&&!flags.includes('slowed'))flags.push('slowed');
  const remixSections=[...sections,...suffix].filter(value=>/\b(?:remix|rework|bootleg)\b/iu.test(value));
  const explicitRemix=artistNames(track.remixArtists);
  const remixNames=explicitRemix.length?explicitRemix:remixSections.flatMap(value=>artistNames(value.replace(/\b(?:remix|rework|bootleg)\b.*$/iu,'').trim())).filter(value=>value&&!/^(?:official|original)$/iu.test(value));
  let base=song.replace(/[\[(]([^\])]+)[\])]/gu,(full,inside)=>decoration.test(inside.trim())||Object.values(patterns).some(pattern=>pattern.test(inside))||/original\s+mix/iu.test(inside)?' ':full);
  base=base.replace(/\s+[–—-]\s+(.+)$/u,(full,tail)=>Object.values(patterns).some(pattern=>pattern.test(tail))||/^(?:original\s+mix|slow)$/iu.test(tail)?' ':full);
  base=base.replace(/\s+(?:official\s+)?(?:audio|video(?:clip)?|lyrics?|visuali[sz]er)\s*$/iu,'').replace(/\s+(?:remix|extended\s+mix|original\s+mix|radio\s+edit|slowed|sped[\s-]*up)\s*$/iu,'');
  return {song,base:identityText(base),artists:[...new Set(artists.map(identityText).filter(Boolean))],channel:identityText(channel),versions:[...new Set(flags)].sort(),remixArtists:[...new Set(remixNames.map(identityText))].sort(),isrc:String(track.isrc||track.external_ids?.isrc||'').replace(/-/g,'').toUpperCase(),duration:Number(track.catalogDuration??track.duration)||0,album:identityText(track.album?.name||track.album)};
}
export function recordingVersionKey(track){const identity=recordingIdentity(track);return JSON.stringify([identity.versions,identity.remixArtists]);}
export function recordingCacheKey(track){const identity=recordingIdentity(track);return JSON.stringify([track.source||'spotify',track.id||'',identity]);}
