import net from 'node:net';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const socket=process.env.MUSIKBOT187_CONTROL_SOCKET||'/run/musikbot187/control.sock';
const commands={restart:['systemctl',['restart','musikbot187.service']],stop:['systemctl',['stop','musikbot187.service']],reboot:['systemctl',['reboot']],poweroff:['systemctl',['poweroff']],update:['systemd-run',['--unit=musikbot187-update','--collect','--no-block','/bin/bash','/opt/musikbot187/install-latest.sh']]};
fs.mkdirSync(new URL('.',`file://${socket}`),{recursive:true});try{fs.unlinkSync(socket);}catch{}
const server=net.createServer(client=>{let raw='';client.setEncoding('utf8');client.on('data',x=>{raw+=x;if(raw.length>4096)client.destroy();});client.on('end',()=>{try{const {action}=JSON.parse(raw);if(!commands[action])throw new Error('Aktion nicht erlaubt');const [cmd,args]=commands[action];const child=spawn(cmd,args,{stdio:'ignore',detached:true});child.unref();client.end(JSON.stringify({ok:true,action}));}catch(e){client.end(JSON.stringify({ok:false,error:e.message}));}});});
server.listen(socket,()=>fs.chmodSync(socket,0o660));
