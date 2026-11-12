import {assertSafeExternalUrl,safeMusicRelativePath} from '../security.js';
import {isYouTubeAccessBlocked} from '../youtube-access.js';
import {resolveSpotifyPlayback} from '../spotify-playback.js';
import {applyResolvedPlayback,canonicalYouTubeVideoUrl,isYouTubeSearchTemporarilyUnavailable,resolveYouTubeAudio,resolveYouTubePipe,youtubeSearch} from './youtube-client.js';

export function normalizeRadioUrl(raw){
  return String(raw).replace(
    /^https?:\/\/streams?\.bigfm\.de\/bigfm-rlp-128-aac\/?(?:[?#].*)?$/i,
    'https://stream.bigfm.de/rlp/aac-128/stream.bigfm.de/'
  );
}

export async function resolveSpotifySource(item,signal,{search=youtubeSearch,resolve=resolveYouTubeAudio,prepareOnly=false,preparedCandidates}={}){
  return resolveSpotifyPlayback(item,signal,{
    search,
    resolve,
    prepareOnly,
    preparedCandidates,
    canonicalUrl:canonicalYouTubeVideoUrl,
    applyResolved:applyResolvedPlayback,
    isAccessBlocked:isYouTubeAccessBlocked,
    isProviderOutage:error=>error?.code==='YOUTUBE_TOKEN_PROVIDER_UNAVAILABLE'||isYouTubeSearchTemporarilyUnavailable(error)
  });
}

export async function resolvePlaybackInput(item,musicDir,{signal,prepareOnly=false,preparedCandidates}={}){
  if(signal?.aborted){
    const error=new Error('Medienauflösung abgebrochen');
    error.name='AbortError';
    throw error;
  }
  if(item.source==='local')return safeMusicRelativePath(musicDir,item.path);
  if(item.source==='youtube'){
    const url=canonicalYouTubeVideoUrl(item.id,item.url);
    if(!url)throw new Error('Der gespeicherte YouTube-Titel enthält keine gültige Video-ID.');
    const resolved=await resolveYouTubeAudio(url,signal,{preferredClient:item._youtubePlaybackClient});
    applyResolvedPlayback(item,resolved);
    return resolved.url;
  }
  if(item.source==='spotify'){
    return resolveSpotifySource(item,signal,{
      prepareOnly,
      preparedCandidates,
      resolve:(url,nextSignal,options)=>item._youtubePlaybackClient==='yt-dlp-pipe'
        ?resolveYouTubePipe(url,nextSignal,options)
        :resolveYouTubeAudio(url,nextSignal,{...options,preferredClient:item._youtubePlaybackClient,allowPipe:true})
    });
  }
  const url=normalizeRadioUrl(item.url);
  await assertSafeExternalUrl(url);
  return url;
}
