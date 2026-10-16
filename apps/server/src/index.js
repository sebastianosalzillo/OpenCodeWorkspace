import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { pool, one, rows, sqlDate } from './db.js';
import { requireUser, requireAdmin, login, logout, createUser, digest, validPassword, validUsername } from './auth.js';
import { attachAgentSockets, isOnline, publish, rpc, subscribe, setCallbacks, disconnectDevice } from './realtime.js';

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'128kb'}));
const origin=process.env.APP_ORIGIN||'http://localhost:5173';
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin!==origin)
    return res.status(403).json({error:'Origine non autorizzata'});
  next();
});
const route=(fn)=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const api=express.Router();
app.use('/api',api);
api.get('/health',(_,res)=>res.json({ok:true}));
const attempts=new Map();
function throttle(req,res,next){
  const key=(req.socket.remoteAddress||'unknown')+':'+req.path;
  const now=Date.now();const state=attempts.get(key)||{n:0,since:now};
  if(now-state.since>300000){state.n=0;state.since=now;}
  state.n++;attempts.set(key,state);
  if(state.n>30)return res.status(429).json({error:'Troppi tentativi, riprova tra 5 minuti'});
  next();
}
setInterval(()=>{const now=Date.now();for(const [key,state] of attempts)if(now-state.since>300000)attempts.delete(key);},300000).unref();
api.post('/auth/login',throttle,route(login));
api.post('/auth/logout',route(logout));
api.get('/me',requireUser,route(async(req,res)=>res.json({user:req.user})));

api.get('/admin/users',requireUser,requireAdmin,route(async(req,res)=>{
  res.json({users:await rows('SELECT id,username,role,active,created_at FROM users ORDER BY created_at DESC')});
}));
api.post('/admin/users',requireUser,requireAdmin,route(async(req,res)=>{
  const username=String(req.body?.username||'').trim();
  const password=req.body?.password;
  const role=req.body?.role==='admin'?'admin':'user';
  if(!validUsername(username)||!validPassword(password))return res.status(400).json({error:'Username 3-64 caratteri e password minimo 12'});
  res.status(201).json({user:await createUser(username,password,role)});
}));

api.post('/devices/pairing-code',requireUser,route(async(req,res)=>{
  const code=randomBytes(12).toString('hex');
  await rows('INSERT INTO pairing_codes(code_hash,user_id,expires_at) VALUES (?,?,?)',
    [digest(code),req.user.id,sqlDate(new Date(Date.now()+10*60*1000))]);
  res.json({code,expiresInSeconds:600});
}));
api.post('/connectors/pair',throttle,route(async(req,res)=>{
  const code=String(req.body?.code||'').trim();
  const name=String(req.body?.name||'').trim();
  if(!/^[0-9a-f]{24}$/.test(code)||name.length<2||name.length>100)return res.status(400).json({error:'Dati associazione non validi'});
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [codes]=await conn.execute('SELECT user_id FROM pairing_codes WHERE code_hash=? AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE',[digest(code)]);
    if(!codes.length){await conn.rollback();return res.status(400).json({error:'Codice scaduto o già usato'});}
    const id=randomUUID(),token=randomBytes(32).toString('hex');
    await conn.execute('INSERT INTO computers(id,owner_id,name,device_token_hash) VALUES (?,?,?,?)',[id,codes[0].user_id,name,digest(token)]);
    await conn.execute('UPDATE pairing_codes SET consumed_at=NOW() WHERE code_hash=?',[digest(code)]);
    await conn.commit();
    res.status(201).json({deviceId:id,token});
  } catch(e){await conn.rollback();throw e;} finally {conn.release();}
}));
api.get('/devices',requireUser,route(async(req,res)=>{
  const pcs=await rows('SELECT id,name,last_seen,created_at FROM computers WHERE owner_id=? AND revoked=0 ORDER BY created_at DESC',[req.user.id]);
  res.json({devices:pcs.map(pc=>({...pc,online:isOnline(pc.id)}))});
}));
api.delete('/devices/:id',requireUser,route(async(req,res)=>{
  const result=await rows('UPDATE computers SET revoked=1 WHERE id=? AND owner_id=?',[req.params.id,req.user.id]);
  if(!result.affectedRows)return res.status(404).json({error:'PC non trovato'});
  disconnectDevice(req.params.id);
  res.json({ok:true});
}));

async function ownedChat(user,id){
  return one(`SELECT ch.* FROM chats ch INNER JOIN computers pc ON pc.id=ch.computer_id
    WHERE ch.id=? AND ch.user_id=? AND pc.owner_id=? AND pc.revoked=0`,[id,user.id,user.id]);
}
api.get('/chats',requireUser,route(async(req,res)=>{
  res.json({chats:await rows('SELECT ch.id,ch.title,ch.computer_id,ch.created_at,ch.updated_at,pc.name AS computer_name FROM chats ch JOIN computers pc ON pc.id=ch.computer_id WHERE ch.user_id=? AND pc.owner_id=? AND pc.revoked=0 ORDER BY ch.updated_at DESC',[req.user.id,req.user.id])});
}));
api.post('/chats',requireUser,route(async(req,res)=>{
  const computerId=String(req.body?.computerId||'');
  const pc=await one('SELECT id FROM computers WHERE id=? AND owner_id=? AND revoked=0',[computerId,req.user.id]);
  if(!pc)return res.status(403).json({error:'PC non autorizzato'});
  if(!isOnline(pc.id))return res.status(409).json({error:'Il PC è offline'});
  const id=randomUUID();
  const title=String(req.body?.title||'Nuova chat').slice(0,160);
  const session=await rpc(pc.id,'create-session',{chatId:id,title});
  if(!session?.id)throw new Error('OpenCode non ha restituito una sessione');
  await rows('INSERT INTO chats(id,user_id,computer_id,title,session_id) VALUES (?,?,?,?,?)',[id,req.user.id,pc.id,title,session.id]);
  res.status(201).json({chat:{id,computer_id:pc.id,title,session_id:session.id}});
}));
api.get('/chats/:id/messages',requireUser,route(async(req,res)=>{
  const chat=await ownedChat(req.user,req.params.id);
  if(!chat)return res.status(404).json({error:'Chat non trovata'});
  const messages=await rows('SELECT id,source_id,role,content,parts_json,created_at FROM messages WHERE chat_id=? ORDER BY seq',[chat.id]);
  const permissions=await rows("SELECT request_id,details_json FROM permission_requests WHERE chat_id=? AND decision='pending'",[chat.id]);
  res.json({chat,messages,permissions});
}));
api.get('/chats/:id/stream',requireUser,route(async(req,res)=>{
  const chat=await ownedChat(req.user,req.params.id);
  if(!chat)return res.status(404).json({error:'Chat non trovata'});
  subscribe(chat.id,res);
}));
const active=new Set();
api.post('/chats/:id/messages',requireUser,route(async(req,res)=>{
  const chat=await ownedChat(req.user,req.params.id);
  if(!chat)return res.status(404).json({error:'Chat non trovata'});
  const text=String(req.body?.text||'').trim();
  if(!text||text.length>12000)return res.status(400).json({error:'Messaggio vuoto o troppo lungo'});
  if(!isOnline(chat.computer_id))return res.status(409).json({error:'PC offline'});
  if(active.has(chat.id))return res.status(409).json({error:'Operazione già in corso in questa chat'});
  active.add(chat.id);
  const jobId=randomUUID(), msgId=randomUUID();
  try{
    await rows('INSERT INTO jobs(id,chat_id,status) VALUES (?,?,?)',[jobId,chat.id,'queued']);
    await rows('INSERT INTO messages(id,chat_id,source_id,role,content) VALUES (?,?,?,?,?)',[msgId,chat.id,`local:${jobId}`,'user',text]);
    await rows('UPDATE chats SET updated_at=NOW() WHERE id=?',[chat.id]);
    publish(chat.id,{type:'message',message:{id:msgId,role:'user',content:text}});
    await rpc(chat.computer_id,'prompt',{chatId:chat.id,sessionId:chat.session_id,text,jobId},25000);
    await rows("UPDATE jobs SET status='running' WHERE id=?",[jobId]);
    res.status(202).json({jobId});
  }catch(err){
    await rows('UPDATE jobs SET status=?,error_text=? WHERE id=?',['failed',err.message,jobId]);
    active.delete(chat.id);
    publish(chat.id,{type:'error',message:err.message});
    res.status(502).json({error:err.message});
  }
}));
api.post('/chats/:id/abort',requireUser,route(async(req,res)=>{
  const chat=await ownedChat(req.user,req.params.id);
  if(!chat)return res.status(404).json({error:'Chat non trovata'});
  await rpc(chat.computer_id,'abort',{chatId:chat.id,sessionId:chat.session_id});
  active.delete(chat.id);
  await rows("UPDATE jobs SET status='interrupted' WHERE chat_id=? AND status IN ('queued','running')",[chat.id]);
  publish(chat.id,{type:'done',interrupted:true});res.json({ok:true});
}));
api.post('/chats/:id/sync',requireUser,route(async(req,res)=>{
  const chat=await ownedChat(req.user,req.params.id);
  if(!chat)return res.status(404).json({error:'Chat non trovata'});
  await rpc(chat.computer_id,'sync',{chatId:chat.id,sessionId:chat.session_id});
  res.json({ok:true});
}));
api.post('/chats/:id/permissions/:requestId',requireUser,route(async(req,res)=>{
  const chat=await ownedChat(req.user,req.params.id);
  if(!chat)return res.status(404).json({error:'Chat non trovata'});
  const decision=req.body?.decision;
  if(!['once','reject'].includes(decision))return res.status(400).json({error:'Decisione non valida'});
  const item=await one("SELECT request_id FROM permission_requests WHERE chat_id=? AND request_id=? AND decision='pending'",[chat.id,req.params.requestId]);
  if(!item)return res.status(404).json({error:'Autorizzazione non trovata'});
  await rpc(chat.computer_id,'permission-reply',{chatId:chat.id,sessionId:chat.session_id,requestId:item.request_id,decision});
  await rows("UPDATE permission_requests SET decision=? WHERE chat_id=? AND request_id=? AND decision='pending'",[decision,chat.id,item.request_id]);
  publish(chat.id,{type:'permission-decided',requestId:item.request_id});res.json({ok:true});
}));

setCallbacks({
  async onEvent(pc,m){
    const chat=await one('SELECT id FROM chats WHERE id=? AND session_id=? AND computer_id=?',[m.chatId,m.sessionId,pc.id]);
    if(!chat)return;
    if(['permission.asked','permission.updated'].includes(m.event?.type)){
      const details=m.event.properties||{};
      const requestId=String(details.id||details.requestID||details.permissionID||'');
      if(requestId.length>0 && requestId.length<180){
        await rows(`INSERT INTO permission_requests(id,chat_id,request_id,details_json)
          VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE details_json=VALUES(details_json)`,[randomUUID(),chat.id,requestId,JSON.stringify(details)]);
        publish(chat.id,{type:'permission',requestId,details});
      }
    }
    if(m.event?.type==='session.error'){
      await rows("UPDATE jobs SET status='failed',error_text='Errore OpenCode' WHERE chat_id=? AND status IN ('queued','running')",[chat.id]);
      active.delete(chat.id);
      publish(chat.id,{type:'error',message:'OpenCode ha segnalato un errore'});
    }
    publish(chat.id,{type:'activity',event:m.event});
  },
  async onMessages(pc,m){
    const chat=await one('SELECT id FROM chats WHERE id=? AND computer_id=? AND session_id=?',[m.chatId,pc.id,m.sessionId]);
    if(!chat)return;
    for(const message of (Array.isArray(m.messages)?m.messages:[])){
      if(message.info?.role!=='assistant'||!message.info.id)continue;
      const parts=Array.isArray(message.parts)?message.parts:[];
      const content=parts.filter(p=>p.type==='text').map(p=>p.text||'').join('\n');
      await rows(`INSERT INTO messages(id,chat_id,source_id,role,content,parts_json)
        VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE content=VALUES(content),parts_json=VALUES(parts_json)`,
        [randomUUID(),chat.id,String(message.info.id),'assistant',content,JSON.stringify(parts)]);
    }
    if(m.done){
      active.delete(chat.id);
      await rows("UPDATE jobs SET status='completed' WHERE chat_id=? AND status IN ('queued','running')",[chat.id]);
    }
    publish(chat.id,{type:'sync',done:!!m.done});
  }
});

app.use((err,req,res,next)=>{
  console.error('API error:',err);
  if(!res.headersSent)res.status(500).json({error:'Errore interno: controlla i log del server'});
});
const server=http.createServer(app);
attachAgentSockets(server);
const port=Number(process.env.PORT||3000);
server.listen(port,()=>console.log(`Workspace API http://localhost:${port}`));
process.on('SIGINT',async()=>{server.close();await pool.end();process.exit(0);});
