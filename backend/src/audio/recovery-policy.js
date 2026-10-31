const boundedDelay=(delays,attempt)=>delays[Math.min(Math.max(0,attempt),delays.length-1)];

export function playbackRecoveryPlan({
  source='local',attempt=0,retryDelays=[],prematureDelays=[],retryAfterMs=0,
  spotifySourceBlocked=false,spotifySourceRetryCount=0,accessBlocked=false,
  endedTooSoon=false,prematureEndExhausted=false,alternateSource=false,
  clientFallback=false,transient=false,badAudio=false,providerOutage=false,
  media403=false,persistentNetworkLoss=false
}={}){
  if(spotifySourceBlocked&&spotifySourceRetryCount<2)return {retry:true,reason:'spotify-source',delay:Math.max(5_000,retryAfterMs||30_000),nextAttempt:0};
  if(accessBlocked)return {retry:true,reason:'access-pause',delay:Math.max(1_000,retryAfterMs),nextAttempt:attempt};
  if(source==='radio')return {retry:true,reason:'radio',delay:boundedDelay(retryDelays,attempt),nextAttempt:attempt+1};
  if(endedTooSoon&&!prematureEndExhausted)return {retry:true,reason:'premature-end',delay:boundedDelay(prematureDelays,attempt),nextAttempt:attempt+1};
  if(alternateSource)return {retry:true,reason:'alternate-source',delay:1_000,nextAttempt:attempt+1};
  if(clientFallback)return {retry:true,reason:'client-fallback',delay:250,nextAttempt:attempt+1};
  if(transient&&!badAudio&&!providerOutage&&!media403&&(persistentNetworkLoss||attempt<retryDelays.length))return {retry:true,reason:'transient',delay:boundedDelay(retryDelays,attempt),nextAttempt:attempt+1};
  return {retry:false,reason:'failed',delay:0,nextAttempt:attempt};
}
