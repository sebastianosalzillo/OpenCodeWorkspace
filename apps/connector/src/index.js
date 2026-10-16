import 'dotenv/config';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import WebSocket from 'ws';
import { LocalOpenCode } from './opencode.js';

const base=String(process.env.WORKSPACE_URL||'http://localhost:3000').replace(/\/$/,'');
if(!/^https:\/\//.test(base) && !/^http:\/\/localhost(?::\d+)?$/.test(base) && !/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(base)){
  throw new Error('WORKSPACE_URL deve essere HTTPS, salvo localhost');
}
const directory=join(homedir(),'.opencode-workspace');
const file=join(directory,'device.json');
async function credentials(){
  if(process.env.WORKSPACE_DEVICE_ID && process.env.WORKSPACE_DEVICE_TOKEN){
    return {deviceId:process.env.WORKSPACE_DEVICE_ID,token:process.env.WORKSPACE_DEVICE_TOKEN};
  }
  try{return JSON.parse(await readFile(file,'utf8'));}catch(err){if(err.code!=='ENOENT')throw err;}
  const code=process.env.PAIR_CODE;
  if(!code)throw new Error('PAIR_CODE mancante. Genera un codice di associazione nell’interfaccia web.');
  const res=await fetch(base+'/api/connectors/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,name:process.env.DEVICE_NAME||homedir().split(/[\\/]/).pop()})});
  const result=await res.json();
  if(!res.ok)throw new Error(result.error||'Associazione fallita');
  await mkdir(directory,{recursive:true});
  await writeFile(file,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  if(process.platform!=='win32')await chmod(file,0o600);
  console.log('PC associato. Rimuovi PAIR_CODE dal file .env.');
  return result;
}
const device=await credentials();
if(!/^[0-9a-f]{64}$/.test(device.token))throw new Error('Token dispositivo non valido');
let socket=null;
let reconnectTimer=null;
const openCode=new LocalOpenCode(packet=>{
  if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(packet));
});
await openCode.start();
await openCode.ready();
openCode.streamEvents().catch(console.error);
console.log('OpenCode locale pronto:',openCode.base);

async function connect(){
  const url=base.replace(/^http/,'ws')+'/agent';
  const ws=new WebSocket(url,{headers:{Authorization:`Bearer ${device.token}`}});
  socket=ws;
  ws.on('open',()=>console.log('Connettore collegato al server Workspace'));
  ws.on('message',async(buffer)=>{
    let m;
    try{m=JSON.parse(buffer.toString());}catch{return;}
    if(m.type!=='rpc'||!m.id)return;
    try{
      const data=await openCode.command(m.method,m.payload||{});
      if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'result',id:m.id,ok:true,data}));
    }catch(e){
      if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'result',id:m.id,ok:false,error:e.message}));
    }
  });
  ws.on('error',e=>console.error('WebSocket:',e.message));
  ws.on('close',()=>{
    if(socket!==ws)return;
    socket=null;
    console.log('Server scollegato: ritento tra 5 secondi');
    if(!reconnectTimer)reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect();},5000);
  });
}
connect();
