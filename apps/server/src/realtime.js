import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { one, rows } from './db.js';
import { digest } from './auth.js';

const devices = new Map();
const pending = new Map();
const listeners = new Map();
let callbacks = {};
export const setCallbacks = (handlers) => { callbacks = handlers; };
export function disconnectDevice(id){devices.get(id)?.terminate();devices.delete(id);}
export const isOnline = (id) => devices.get(id)?.readyState === WebSocket.OPEN;

export function publish(chatId, data) {
  const encoded = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of listeners.get(chatId) || []) res.write(encoded);
}
export function subscribe(chatId, res) {
  res.set({ 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache, no-transform', 'Connection':'keep-alive', 'X-Accel-Buffering':'no' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({type:'connected'})}\n\n`);
  if (!listeners.has(chatId)) listeners.set(chatId, new Set());
  listeners.get(chatId).add(res);
  const keep = setInterval(()=>res.write(': heartbeat\n\n'),20000);
  res.on('close',()=>{clearInterval(keep);listeners.get(chatId)?.delete(res);});
}
export function rpc(deviceId,method,payload={},timeoutMs=20000) {
  return new Promise((resolve,reject)=>{
    const ws = devices.get(deviceId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error('Computer offline'));
    const id=randomUUID();
    const timer=setTimeout(()=>{pending.delete(id);const e=new Error('Timeout RPC: consegna forse avvenuta');e.code='DELIVERY_UNCERTAIN';reject(e);},timeoutMs);
    pending.set(id,{deviceId,resolve,reject,timer,socket:ws});
    ws.send(JSON.stringify({type:'rpc',id,method,payload}),err=>{
      if(err){clearTimeout(timer);pending.delete(id);const e=new Error('Errore trasporto: consegna forse avvenuta');e.code='DELIVERY_UNCERTAIN';reject(e);}
    });
  });
}

export function attachAgentSockets(server) {
  const wss=new WebSocketServer({noServer:true,maxPayload:2*1024*1024});
  server.on('upgrade',async(req,socket,head)=>{
    if(new URL(req.url,'http://localhost').pathname!=='/agent') return socket.destroy();
    try{
      const match=/^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization||'');
      if(!match) return socket.destroy();
      const pc=await one(`SELECT pc.id,pc.owner_id FROM computers pc JOIN users u ON u.id=pc.owner_id
        WHERE pc.device_token_hash=? AND pc.revoked=0 AND u.active=1`,[digest(match[1])]);
      if(!pc)return socket.destroy();
      wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,pc));
    }catch{socket.destroy();}
  });
  wss.on('connection',(ws,pc)=>{
    devices.get(pc.id)?.terminate();
    devices.set(pc.id,ws);
    ws.pc=pc;
    ws.isAlive=true;
    ws.on('pong',()=>{ws.isAlive=true;});
    rows('UPDATE computers SET last_seen=NOW() WHERE id=?',[pc.id]).catch(console.error);
    Promise.resolve().then(()=>callbacks.onDeviceConnect?.(pc)).catch(err=>console.error('Agent resume:',err.message));
    ws.on('message',async(raw)=>{
      // Una connessione rimpiazzata non può più modificare lo stato centrale.
      if(devices.get(pc.id)!==ws)return;
      try{
        const m=JSON.parse(raw.toString());
        if(m.type==='result'){
          const x=pending.get(m.id);
          if(!x || x.deviceId!==pc.id || x.socket!==ws)return;
          clearTimeout(x.timer);pending.delete(m.id);
          m.ok ? x.resolve(m.data) : x.reject(new Error(String(m.error||'Errore connettore').slice(0,500)));
        } else if(m.type==='event') await callbacks.onEvent?.(pc,m);
        else if(m.type==='messages') await callbacks.onMessages?.(pc,m);
      }catch(err){console.error('Agent message:',err.message);}
    });
    ws.on('close',()=>{
      if(devices.get(pc.id)===ws){
        devices.delete(pc.id);
        Promise.resolve().then(()=>callbacks.onDeviceDisconnect?.(pc)).catch(err=>console.error('Agent disconnect:',err.message));
      }
      for(const [id,x] of pending){if(x.socket===ws){clearTimeout(x.timer);pending.delete(id);const e=new Error('PC scollegato: consegna forse avvenuta');e.code='DELIVERY_UNCERTAIN';x.reject(e);}}
    });
  });
  const heartbeat=setInterval(()=>{
    for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}
  },30000);
  server.on('close',()=>clearInterval(heartbeat));
}
