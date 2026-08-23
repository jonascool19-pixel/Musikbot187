'use strict';
const message=document.querySelector('#message');
try{
  const query=new URLSearchParams(location.search),state=String(query.get('state')||''),encodedOrigin=state.split('.').at(-1);
  if(!state.includes('.')||!encodedOrigin)throw new Error('Die Spotify-Antwort enthält keinen gültigen Sicherheitsstatus. Bitte im Dashboard erneut starten.');
  const padded=encodedOrigin.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(encodedOrigin.length/4)*4,'='),origin=new URL(atob(padded));
  if(!['http:','https:'].includes(origin.protocol)||origin.origin!==origin.href.replace(/\/$/,''))throw new Error('Die lokale Dashboard-Adresse ist ungültig.');
  const payload={source:'musikbot187-spotify-relay',state,code:String(query.get('code')||''),error:String(query.get('error')||'')};
  if(window.opener){window.opener.postMessage(payload,origin.origin);message.textContent='Freigabe übermittelt. Du kannst zu MusikBot187 zurückkehren; dieses Fenster schließt sich gleich.';setTimeout(()=>window.close(),1200);}
  else{message.textContent='Du wirst jetzt sicher zu deinem lokalen MusikBot187-Dashboard zurückgeführt …';location.replace(`${origin.origin}/#spotify-relay=${encodeURIComponent(btoa(JSON.stringify(payload)))}`);}
}catch(error){message.textContent=error.message;}
