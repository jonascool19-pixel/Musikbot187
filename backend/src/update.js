export const appVersion='5.2.1';
export const latestPackageUrl='https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/backend/package.json';

export function compareVersions(left,right){
  const a=String(left||'').split('.').map(value=>Number(value)||0),b=String(right||'').split('.').map(value=>Number(value)||0);
  for(let index=0;index<Math.max(a.length,b.length);index++){
    const difference=(a[index]||0)-(b[index]||0);
    if(difference)return Math.sign(difference);
  }
  return 0;
}

export async function updateStatus(fetcher=fetch){
  const response=await fetcher(latestPackageUrl,{headers:{accept:'application/json','user-agent':`MusikBot187/${appVersion}`},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error(`Update-Server antwortet mit HTTP ${response.status}.`);
  const body=await response.json(),latest=String(body?.version||'').trim();
  if(!/^\d+\.\d+\.\d+$/.test(latest))throw new Error('Der Update-Server hat keine gültige Versionsnummer geliefert.');
  return {current:appVersion,latest,available:compareVersions(latest,appVersion)>0,source:'GitHub main'};
}
