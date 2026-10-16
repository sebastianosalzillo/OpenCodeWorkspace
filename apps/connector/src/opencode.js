import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { publicModels, isModelAvailable, validModel } from './models.js';
import { matchingReply } from './recovery.js';

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
    this.finishing=new Set();
    this.busySeen=new Set();
    this.pollGenerations=new Map();
    this.pendingJobs=new Map();
    this.pollIntervalMs=3000;
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
    if(method==='diagnostics'){
      const health=await this.call('/global/health');
      return {healthy:!!health?.healthy,version:String(health?.version||'non disponibile'),
        workdir:this.workdir,port:this.port};
    }
    if(method==='models'){
      const providers=await this.call('/provider');
      return { models:publicModels(providers) };
    }
    if(method==='restore-sessions'){
      if(!Array.isArray(p.sessions)||p.sessions.length>100)throw new Error('Batch di sessioni non valido');
      for(const s of p.sessions){
        if(typeof s.sessionId!=='string'||s.sessionId.length>180||!s.sessionId || typeof s.chatId!=='string'||s.chatId.length>180||!s.chatId)throw new Error('Sessione da ripristinare non valida');
      }
      for(const s of p.sessions)this.sessionToChat.set(s.sessionId,s.chatId);
      return {restored:p.sessions.length};
    }
    if(method==='create-session'){
      if(typeof p.chatId!=='string'||!p.chatId)throw new Error('Chat ID non valido');
      const s=await this.call('/session','POST',{title:String(p.title||'Workspace')});
      this.sessionToChat.set(s.id,p.chatId);
      return {id:s.id};
    }
    if(!p.sessionId || !p.chatId)throw new Error('Sessione mancante');
    this.sessionToChat.set(p.sessionId,p.chatId);
    const id=encodeURIComponent(p.sessionId);
    if(method==='delete-session'){
      await this.call(`/session/${id}`,'DELETE');
      this.sessionToChat.delete(p.sessionId);
      this.done.delete(p.sessionId);
      this.busySeen.delete(p.sessionId);
      this.pollGenerations.delete(p.sessionId);
      this.pendingJobs.delete(p.sessionId);
      return {ok:true};
    }
    if(method==='status'){
      const statuses=await this.call('/session/status');
      const status=statuses?.[p.sessionId]?.type || 'idle';
      return {status:['busy','idle','retry'].includes(status)?status:'unknown'};
    }
    if(method==='recover'){
      // Al ricollegamento nessun prompt viene inviato una seconda volta.
      const statuses=await this.call('/session/status');
      const busy=statuses?.[p.sessionId]?.type==='busy';
      const messages=await this.call(`/session/${id}/message`);
      // Il server rimanda il testo e l'istante del job pendente.
      // Una risposta precedente o non correlabile NON sblocca la chat.
      const tracked=typeof p.text==='string' && p.text
        ? {jobId:p.jobId||null,text:p.text,after:Number(p.createdAfter)||null}
        : null;
      if(tracked)this.pendingJobs.set(p.sessionId,tracked);
      const completed=!!tracked && !busy && !!matchingReply(messages,tracked);
      if(completed){
        this.done.add(p.sessionId);
        this.pendingJobs.delete(p.sessionId);
      }
      this.emit({type:'messages',chatId:p.chatId,sessionId:p.sessionId,messages,done:completed,jobId:tracked?.jobId||null});
      if(!completed && tracked){
        if(busy)this.busySeen.add(p.sessionId);
        const generation=(this.pollGenerations.get(p.sessionId)||0)+1;
        this.pollGenerations.set(p.sessionId,generation);
        this.done.delete(p.sessionId);
        this.pollUntilIdle(p.sessionId,p.chatId,null,generation).catch(err=>console.error('Recovery polling:',err.message));
      }
      return {running:busy,completed,unresolved:!busy&&!completed};
    }
    if(method==='prompt'){
      if(typeof p.text!=='string'||!p.text.trim()||p.text.length>12000)throw new Error('Prompt non valido');
      let model;
      if(p.model!==undefined && p.model!==null){
        if(!validModel(p.model))throw new Error('Modello AI non valido');
        const providers=await this.call('/provider');
        if(!isModelAvailable(publicModels(providers),p.model))throw new Error('Modello non disponibile sul PC');
        model={providerID:p.model.providerID,modelID:p.model.modelID};
      }
      // Memorizziamo gli ID assistant preesistenti: la mancanza di una fase
      // busy osservabile non deve bloccare per sempre le risposte rapide.
      const before=await this.call(`/session/${id}/message`);
      if(!Array.isArray(before))throw new Error('Cronologia OpenCode non valida');
      const baseline=new Set(before.filter(m=>m.info?.role==='assistant').map(m=>m.info?.id).filter(Boolean));
      const generation=(this.pollGenerations.get(p.sessionId)||0)+1;
      this.pollGenerations.set(p.sessionId,generation);
      this.done.delete(p.sessionId);
      this.busySeen.delete(p.sessionId);
      this.pendingJobs.set(p.sessionId,{jobId:p.jobId||null,text:p.text,after:null,baseline});
      await this.call(`/session/${id}/prompt_async`,'POST',{parts:[{type:'text',text:p.text}],...(model?{model}:{})});
      this.pollUntilIdle(p.sessionId,p.chatId,baseline,generation).catch(err=>console.error('Fallback sync:',err.message));
      return {accepted:true};
    }
    if(method==='abort'){await this.call(`/session/${id}/abort`,'POST');this.pollGenerations.delete(p.sessionId);this.pendingJobs.delete(p.sessionId);this.done.add(p.sessionId);await this.sync(p.sessionId,p.chatId,false);return {ok:true};}
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
  async sync(sessionId,chatId,done,jobId=null){
    const messages=await this.call(`/session/${encodeURIComponent(sessionId)}/message`);
    this.emit({type:'messages',chatId,sessionId,messages,done,jobId});
  }
  async finish(sessionId){
    if(this.done.has(sessionId)||this.finishing.has(sessionId))return;
    const tracked=this.pendingJobs.get(sessionId);
    if(!tracked)return; // un evento session.idle vecchio non chiude un job nuovo
    this.finishing.add(sessionId);
    try{
      const statuses=await this.call('/session/status');
      if(['busy','retry'].includes(statuses?.[sessionId]?.type))return;
      const messages=await this.call(`/session/${encodeURIComponent(sessionId)}/message`);
      const chatId=this.sessionToChat.get(sessionId);
      const completed=!!matchingReply(messages,tracked);
      if(chatId)this.emit({type:'messages',chatId,sessionId,messages,done:completed,jobId:tracked.jobId});
      if(!completed)return;
      this.done.add(sessionId);
      this.pendingJobs.delete(sessionId);
    }finally{this.finishing.delete(sessionId);}
  }
  async pollUntilIdle(sessionId,chatId,baseline=null,generation=null){
    // Recupero di sicurezza quando una notifica SSE si perde.
    for(let attempt=0;attempt<120 && !this.done.has(sessionId);attempt++){
      if(generation!==null && this.pollGenerations.get(sessionId)!==generation)break;
      await new Promise(r=>setTimeout(r,this.pollIntervalMs));
      try{
        const statuses=await this.call('/session/status');
        const status=statuses?.[sessionId]?.type;
        if(status==='busy')this.busySeen.add(sessionId);
        // L'API può omettere le sessioni inattive: richiedi prima una prova di busy.
        if(status==='idle'||(this.busySeen.has(sessionId)&&!status)){
          if(baseline){
            const messages=await this.call(`/session/${encodeURIComponent(sessionId)}/message`);
            const answered=Array.isArray(messages)&&messages.some(m=>
              m.info?.role==='assistant' && m.info?.id && !baseline.has(m.info.id) && m.info?.time?.completed);
            if(!answered)continue;
          }
          await this.finish(sessionId);if(this.done.has(sessionId))break;
        }
        // Anche dopo un riavvio, l'API può omettere lo stato busy.
        // È sicuro tentare finish: matchingReply controlla il prompt effettivo.
        if(!status&&this.pendingJobs.has(sessionId)){
          await this.finish(sessionId);
          if(this.done.has(sessionId))break;
        }
        // Alcuni server non emettono mai busy per prompt rapidissimi.
        if(!status&&baseline){
          const messages=await this.call(`/session/${encodeURIComponent(sessionId)}/message`);
          const answered=Array.isArray(messages)&&messages.some(m=>
            m.info?.role==='assistant'&&m.info?.id&&!baseline.has(m.info.id)&&m.info?.time?.completed);
          if(answered){await this.finish(sessionId);if(this.done.has(sessionId))break;}
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
