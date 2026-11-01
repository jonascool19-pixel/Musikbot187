const normalize=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ß/g,'ss').toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const terms=value=>Array.isArray(value)?value.map(normalize).filter(Boolean):[];
const contains=(text,term)=>Boolean(term&&` ${normalize(text)} `.includes(` ${normalize(term)} `));
const artistOf=track=>{const title=String(track?.title||''),parts=title.split(/\s+[–—-]\s+/u),visible=parts.length>1?parts[0]:'';return String(visible||track?.artist||track?.channel||track?.uploader||'').replace(/\s*-\s*Topic$/iu,'').trim()};

export function createTasteModel({preferredStyles=[],preferredArtists=[],learnedStyles=[],learnedArtists=[],blockedStyles=[]}={}){
  return Object.freeze({
    styles:Object.freeze([...new Set([...terms(preferredStyles),...terms(learnedStyles)])]),
    artists:Object.freeze([...new Set([...terms(preferredArtists),...terms(learnedArtists)])]),
    blocked:Object.freeze([...new Set(terms(blockedStyles))])
  });
}

export function scoreTasteCandidate(track,model,{queryStyle='',queryArtist='',candidateStyles=[]}={}){
  const title=String(track?.title||''),artist=artistOf(track),text=`${title} ${artist} ${(track?.styles||[]).join(' ')}`,styles=[...new Set([...terms(candidateStyles),...terms(track?.styles)])];
  if(model.blocked.some(term=>contains(text,term)))return {allowed:false,score:-100,reason:'blocked'};
  const guarded=[['classical',/\b(?:classical|klass(?:ik|isch\w*)|orchestra|orchester|orchestral|symphon(?:y|ie)|opera|oper|concerto|sonat[ae]|mozart|beethoven|vivaldi|chopin|brahms)\b/i],['schlager',/\bschlager\b/i],['metal',/\b(?:metal|deathcore|metalcore|black metal)\b/i]];
  for(const [genre,pattern] of guarded)if(pattern.test(text)&&!model.styles.some(style=>pattern.test(style)||style===genre))return {allowed:false,score:-80,reason:'unlearned-genre'};
  let score=0,artistMatch=false,styleMatch=false;
  const styleConflict=styles.length&&model.styles.length&&styles.some(style=>!model.styles.some(preferred=>contains(style,preferred)||contains(preferred,style)));
  if(styleConflict)return {allowed:false,score:-40,reason:'style-conflict'};
  for(const wanted of model.artists)if(contains(artist,wanted)||contains(wanted,artist)){score+=55;artistMatch=true;break}
  for(const wanted of model.styles)if(styles.some(style=>contains(style,wanted)||contains(wanted,style))||contains(text,wanted)){score+=35;styleMatch=true;break}
  if(queryArtist){if(contains(artist,queryArtist)||contains(queryArtist,artist)){score+=35;artistMatch=true}else return {allowed:false,score:-50,reason:'artist'};}
  if(queryStyle){
    const wanted=normalize(queryStyle);
    // Search context is a useful hint, but not proof: YouTube occasionally
    // inserts unrelated official-audio uploads into a genre result page.
    // Unknown artists therefore need visible style evidence; learned artists
    // can still contribute ordinary song titles without repeating the genre.
    score+=styleMatch||styles.some(style=>contains(style,wanted)||contains(wanted,style))?40:12;
  }
  if(!model.styles.length&&!model.artists.length&&!queryStyle&&!queryArtist)return {allowed:true,score:0,reason:'unconstrained'};
  return {allowed:score>=20,score,reason:artistMatch||styleMatch||queryStyle?'taste':'no-evidence'};
}

export function tasteCandidateAllowed(track,model,options){return scoreTasteCandidate(track,model,options).allowed}
