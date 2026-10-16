import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

export function sessionFromEvent(event){
  const p=event?.properties||{};
  return p.sessionID || p.sessionId || p.part?.sessionID || p.info?.sessionID || p.session?.id || null;
}
export class LocalOpenCode {
  constructor(emit){
    this.port=Number(process.env.OPENCODE_PORT||4096);
    if(!Number.isInteger(this.port)||this.port<1024||this.port>65535)throw new Error('Porta OpenCode non valida');
    this.base=`http://127.0.0.1:${this.port}`;
    this.password=process.env.OPENCODE_SERVER_PASSWORD;
    if(!this.password || this.password.length<16)throw new Error('Imposta OPENCODE_SERVER_PASSWORD (minimo 16 caratteri)');
    this.username=process.env.OPENCODE_SERVER_USERNAME||'opencode';
    this.workdir=process.env.OPENCODE_WORKDIR;
    if(!this.workdir)throw new Error('Imposta OPENCODE_WORKDIR sul percorso del progetto da autorizzare');
    mkdirSync(this.workdir,{recursive:true});
    if(!existsSync(this.workdir))throw new Error('Cartella OpenCode non disponibile');
    this.emit=emit;
    this.sessionToChat=new Map();
    this.done=new Set();
  }
  auth(){return 'Basic '+Buffer.from(`${this.username}:${this.password}`).toString('base64');}
  async call(path,method='GET',body){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20000);
    try{
      const res=await fetch(this.base+path,{method,headers:{Authorization:this.auth(),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      if(!res.ok){const info=(await res.text()).slice(0,400);throw new Error(`OpenCode HTTP ${res.status}: ${info}`);}
      return res.status===204?null:res.json();
    }finally{clearTimeout(timer);}
  }
  async start(){
    if(process.env.AUTO_START_OPENCODE!=='true')return;
    let cmd,args;
    if(process.platform==='win32'){
      cmd='cmd.exe';args=['/d','/s','/c',`opencode serve --hostname 127.0.0.1 --port ${this.port}`];
    }else{cmd='opencode';args=['serve','--hostname','127.0.0.1','--port',String(this.port)];}
    const env={...process.env,OPENCODE_SERVER_PASSWORD:this.password,OPENCODE_SERVER_USERNAME:this.username,
      OPENCODE_CONFIG_CONTENT:JSON.stringify({permission:{read:'allow',glob:'allow',grep:'allow',edit:'ask',bash:'ask',external_directory:'deny'}})};
    this.proc=spawn(cmd,args,{cwd:this.workdir,env,windowsHide:true,stdio:'ignore'});
    this.proc.on('error',e=>console.error('Impossibile avviare OpenCode:',e.message));
    this.proc.on('exit',code=>console.error('OpenCode terminato, codice:',code));
    for(let i=0;i<40;i++){
      try{await this.call('/global/health');return;}catch{await new Promise(r=>setTimeout(r,500));}
    }
    throw new Error('OpenCode non risponde su localhost: controlla installazione, porta e password');
  }
  async ready(){const result=await this.call('/global/health');if(!result?.healthy)throw new Error('OpenCode non pronto');}
  async command(method,p){
    if(method==='create-session'){
      const s=await this.call('/session','POST',{title:String(p.title||'Workspace')});
      this.sessionToChat.set(s.id,p.chatId);
      return {id:s.id};
    }
    if(!p.sessionId || !p.chatId)throw new Error('Sessione mancante');
    this.sessionToChat.set(p.sessionId,p.chatId);
    const id=encodeURIComponent(p.sessionId);
    if(method==='prompt'){
      // L'endpoint ritorna subito; l'output arriverà dagli eventi SSE.
      this.done.delete(p.sessionId);
      await this.call(`/session/${id}/prompt_async`,'POST',{parts:[{type:'text',text:p.text}]});
      this.pollUntilIdle(p.sessionId,p.chatId).catch(err=>console.error('Fallback sync:',err.message));
      return {accepted:true};
    }
    if(method==='abort'){await this.call(`/session/${id}/abort`,'POST');await this.sync(p.sessionId,p.chatId,true);return {ok:true};}
    if(method==='sync'){await this.sync(p.sessionId,p.chatId,false);return {ok:true};}
    if(method==='permission-reply'){
      if(!['once','reject'].includes(p.decision))throw new Error('Scelta permesso non valida');
      const request=encodeURIComponent(p.requestId);
      // Endpoint della API OpenCode più recente.
      try {await this.call(`/permission/${request}/reply`,'POST',{reply:p.decision});}
      catch(e){
        if(!e.message.includes('HTTP 404'))throw e;
        await this.call(`/session/${id}/permissions/${request}`,'POST',{response:p.decision,remember:false});
      }
      return {ok:true};
    }
    throw new Error('RPC sconosciuta');
  }
  async sync(sessionId,chatId,done){
    const messages=await this.call(`/session/${encodeURIComponent(sessionId)}/message`);
    this.emit({type:'messages',chatId,sessionId,messages,done});
  }
  async finish(sessionId){
    if(this.done.has(sessionId))return;
    this.done.add(sessionId);
    const chatId=this.sessionToChat.get(sessionId);
    if(chatId)await this.sync(sessionId,chatId,true);
  }
  async pollUntilIdle(sessionId,chatId){
    // Recupero di sicurezza quando una notifica SSE si perde.
    for(let attempt=0;attempt<120 && !this.done.has(sessionId);attempt++){
      await new Promise(r=>setTimeout(r,3000));
      try{
        const statuses=await this.call('/session/status');
        if(statuses?.[sessionId]?.type==='idle'){
          await this.finish(sessionId);break;
        }
      }catch(err){if(attempt%10===0)console.error('Polling OpenCode:',err.message);}
    }
  }
  async streamEvents(){
    for(;;){
      try{
        const response=await fetch(this.base+'/event',{headers:{Authorization:this.auth(),Accept:'text/event-stream'}});
        if(!response.ok)throw new Error(`Event stream HTTP ${response.status}`);
        const decoder=new TextDecoder();let buffer='';
        for await(const chunk of response.body){
          buffer+=decoder.decode(chunk,{stream:true}).replace(/\r\n/g,'\n');
          if(buffer.length>2_000_000){buffer='';continue;}
          let pos;
          while((pos=buffer.indexOf('\n\n'))!==-1){
            const block=buffer.slice(0,pos);buffer=buffer.slice(pos+2);
            const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');
            if(!data)continue;
            try{
              const event=JSON.parse(data);
              const sessionId=sessionFromEvent(event);
              const chatId=this.sessionToChat.get(sessionId);
              if(!chatId)continue;
              const safe={type:event.type,properties:event.properties};
              this.emit({type:'event',chatId,sessionId,event:safe});
              if(event.type==='session.idle')await this.finish(sessionId);
            }catch(e){console.error('Evento OpenCode:',e.message);}
          }
        }
      }catch(e){console.error('SSE OpenCode disconnesso:',e.message);}
      await new Promise(r=>setTimeout(r,2500));
    }
  }
}
