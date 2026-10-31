const sessions=new WeakMap();

export const reusableSourceMaxAgeMs=5*60_000;

export function rememberPlaybackSource(item,input,{now=Date.now()}={}){
  if(!item||typeof item!=='object'||!input)return input;
  sessions.set(item,{input,resolvedAt:now});
  return input;
}

export function reusablePlaybackSource(item,{now=Date.now(),maxAgeMs=reusableSourceMaxAgeMs}={}){
  const session=item&&typeof item==='object'?sessions.get(item):null;
  if(!session||now-session.resolvedAt>maxAgeMs){
    if(item&&typeof item==='object')sessions.delete(item);
    return '';
  }
  return session.input;
}

export function forgetPlaybackSource(item){
  if(item&&typeof item==='object')sessions.delete(item);
}
