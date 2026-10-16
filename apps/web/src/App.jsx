import {useCallback,useEffect,useRef,useState} from 'react';
import {summarizeToolPart,updateLiveTools,updatePartialText} from './activity.js';
import {Bot,Send,Plus,Monitor,Shield,LogOut,Settings,CheckCircle2,XCircle,RefreshCw,Square,ChevronLeft,Copy,Wifi,WifiOff,Terminal,PanelLeftClose,Pencil,Trash2,Activity} from 'lucide-react';

async function api(path,opts={}){
  const res=await fetch('/api'+path,{credentials:'same-origin',...opts,headers:{...(opts.body?{'Content-Type':'application/json'}:{}),...(opts.headers||{})}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||`Errore HTTP ${res.status}`);
  return data;
}
const json=(method,body)=>({method,body:JSON.stringify(body)});
function Login({onLogin}){
  const [username,setUsername]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function login(e){e.preventDefault();setBusy(true);setError('');try{const x=await api('/auth/login',json('POST',{username,password}));onLogin(x.user);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div className="login-layout"><div className="login-banner"><div className="brand large"><span className="brand-icon"><Bot/></span> OpenCode <em>Workspace</em></div><h1>Il tuo agente AI.<br/>Il tuo computer.<br/><span>Le tue conversazioni.</span></h1><p>Un unico spazio sicuro per gestire OpenCode sui tuoi PC Windows.</p><div className="banner-foot">Accesso personale · Conversazioni separate · Connessioni private</div></div><main className="login-form"><form onSubmit={login} className="login-card"><div className="eyebrow">ACCESSO WORKSPACE</div><h2>Bentornato</h2><p className="muted">Accedi con le credenziali create dall'amministratore.</p><label>Nome utente<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/></label><label>Password<input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>{error&&<p className="error">{error}</p>}<button className="primary full" disabled={busy}>{busy?'Accesso...':'Accedi'} <span>→</span></button></form></main></div>;
}
function ToolDetails({part,live=false}){
  const item=part?.type==='tool'?summarizeToolPart(part):part;
  if(!item)return null;
  const statusLabels={pending:'In attesa',running:'In esecuzione',completed:'Completato',error:'Errore',unknown:'Stato sconosciuto'};
  const display=item.target||item.title||item.command.split('\n')[0]||'Dettagli dello strumento';
  return <details className={'tool-details '+(live?'live ':'')+'tool-'+item.status}>
    <summary><Terminal size={15}/><b>{item.tool}</b><span className="tool-target" title={display}>{display}</span><span className="tool-status">{statusLabels[item.status]}</span></summary>
    <div className="tool-detail-body">
      {item.command&&<section><small>Comando</small><pre>{item.command}</pre></section>}
      {item.patch&&<section><small>Patch / modifica</small><pre>{item.patch}</pre></section>}
      {item.output&&<section><small>Risultato</small><pre>{item.output}</pre></section>}
      {item.error&&<section><small>Errore</small><pre>{item.error}</pre></section>}
      {!item.command&&!item.patch&&!item.output&&!item.error&&<p>OpenCode non ha restituito ulteriori dettagli.</p>}
    </div>
  </details>;
}
function Workspace({user,onLogout}){
  const [devices,setDevices]=useState([]),[chats,setChats]=useState([]),[chatId,setChatId]=useState(null),[messages,setMessages]=useState([]),[runningJobs,setRunningJobs]=useState([]),[permissions,setPermissions]=useState([]),[activity,setActivity]=useState([]),[partial,setPartial]=useState({}),[liveTools,setLiveTools]=useState([]),[selectedPc,setSelectedPc]=useState(''),[draft,setDraft]=useState(''),[error,setError]=useState(''),[sending,setSending]=useState(false),[tab,setTab]=useState('chat'),[pairCode,setPairCode]=useState(''),[users,setUsers]=useState([]),[newUser,setNewUser]=useState({username:'',password:'',role:'user'}),[sidebar,setSidebar]=useState(true),[busy,setBusy]=useState(false),[deviceDiagnostics,setDeviceDiagnostics]=useState({}),[diagBusy,setDiagBusy]=useState(''),[models,setModels]=useState([]),[selectedModel,setSelectedModel]=useState(''),[modelBusy,setModelBusy]=useState(false),[sessionStatus,setSessionStatus]=useState(null),[statusBusy,setStatusBusy]=useState(false);
  const scroll=useRef(null); const chatRef=useRef(null);chatRef.current=chatId;
  const loadSidebar=useCallback(async()=>{try{const [d,c]=await Promise.all([api('/devices'),api('/chats')]);setDevices(d.devices);setChats(c.chats);setSelectedPc(p=>d.devices.some(pc=>pc.id===p)?p:d.devices[0]?.id||'');}catch(e){setError(e.message);}},[]);
  const loadMessages=useCallback(async(id)=>{if(!id)return;try{const data=await api('/chats/'+id+'/messages');if(chatRef.current===id){setMessages(data.messages);setPermissions(data.permissions);setRunningJobs(data.jobs||[]);}}catch(e){setError(e.message);}},[]);
  useEffect(()=>{loadSidebar();const timer=setInterval(loadSidebar,10000);return()=>clearInterval(timer);},[loadSidebar]);
  useEffect(()=>{if(chatId)loadMessages(chatId);else {setMessages([]);setPermissions([]);setRunningJobs([]);}setActivity([]);setPartial({});setLiveTools([]);},[chatId,loadMessages]);
  useEffect(()=>{
    if(!chatId)return;
    const es=new EventSource('/api/chats/'+chatId+'/stream');
    es.onmessage=(evt)=>{
      try{const e=JSON.parse(evt.data);
        if(['connected','message','sync','permission','permission-decided','done'].includes(e.type))loadMessages(chatId);
        if((e.type==='sync' && e.done)||e.type==='done'){setPartial({});setLiveTools([]);setSending(false);loadSidebar();}
        if(e.type==='error'){setError(e.message||'Errore agente');setSending(false);}
        if(e.type==='recovery'){loadMessages(chatId);setError('Connessione ripristinata: esito del lavoro da verificare, nessun prompt reinviato.');}
        if(e.type==='activity'){
          const type=e.event?.type||'evento';const p=e.event?.properties||{};
          if(type==='message.part.updated'||type==='message.part.delta'){setPartial(prev=>updatePartialText(prev,e.event));setLiveTools(prev=>updateLiveTools(prev,e.event));}
          if(['message.part.updated','message.part.delta','permission.asked','session.status','session.idle','session.error','workspace.recovery'].includes(type)){
            const detail=p.part?.type==='tool' ? `${p.part.tool||'strumento'} · ${p.part.state?.status||''}` : type;
            setActivity(a=>[...a.slice(-19),{id:Math.random(),type,detail}]);
          }
        }
      }catch{/* ignorare evento malformato */}
    };return()=>es.close();
  },[chatId,loadMessages,loadSidebar]);
  useEffect(()=>{scroll.current?.scrollIntoView({behavior:'smooth'});},[messages,partial,liveTools,activity,permissions]);
  const current=chats.find(c=>c.id===chatId), currentPc=devices.find(d=>d.id===current?.computer_id);
  useEffect(()=>{
    setModels([]);setSelectedModel('');setSessionStatus(null);
    if(!current?.computer_id||!currentPc?.online)return;
    let canceled=false;
    setModelBusy(true);
    api(`/devices/${encodeURIComponent(current.computer_id)}/models`)
      .then(data=>{if(!canceled)setModels(data.models||[]);})
      .catch(e=>{if(!canceled)setError('Impossibile caricare i modelli: '+e.message);})
      .finally(()=>{if(!canceled)setModelBusy(false);});
    return ()=>{canceled=true;};
  },[chatId,current?.computer_id,currentPc?.online]);
  async function refreshStatus(){
    if(!chatId)return;
    setStatusBusy(true);
    try{const data=await api(`/chats/${chatId}/status`);setSessionStatus(data);await loadMessages(chatId);}
    catch(e){setError(e.message);}finally{setStatusBusy(false);}
  }

  async function newChat(){if(!selectedPc){setError('Associa prima un PC.');setTab('devices');return;}setBusy(true);setError('');try{const r=await api('/chats',json('POST',{computerId:selectedPc,title:'Nuova chat'}));await loadSidebar();setChatId(r.chat.id);setTab('chat');}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function send(e){e?.preventDefault();const text=draft.trim();if(!text||!chatId||sending||runningJobs.length)return;setDraft('');setError('');setSending(true);try{await api(`/chats/${chatId}/messages`,json('POST',{text,...(selectedModel?{model:JSON.parse(selectedModel)}:{})}));loadMessages(chatId);}catch(e){setError(e.message);await loadMessages(chatId);if(!/forse avviata|non ripetere il prompt/i.test(e.message))setDraft(text);setSending(false);}}
  async function abort(){try{await api(`/chats/${chatId}/abort`,json('POST',{}));setSending(false);loadMessages(chatId);}catch(e){setError(e.message);}}
  async function resolveUncertain(){
    if(!window.confirm('Hai controllato i risultati su OpenCode? Il job verrà chiuso come interrotto/non verificato, NON come completato. Non ripetere automaticamente il comando.'))return;
    try{
      await api(`/chats/${chatId}/resolve`,json('POST',{reviewed:true}));
      setSending(false);await loadMessages(chatId);
    }catch(e){setError(e.message);}
  }
  async function answer(requestId,decision){try{await api(`/chats/${chatId}/permissions/${encodeURIComponent(requestId)}`,json('POST',{decision}));loadMessages(chatId);}catch(e){setError(e.message);}}
  async function pair(){try{const r=await api('/devices/pairing-code',json('POST',{}));setPairCode(r.code);}catch(e){setError(e.message);}}
  async function revokeDevice(id){
    if(!window.confirm('Revocare questo PC? Il suo connettore non potrà più accedere al Workspace.'))return;
    try{await api('/devices/'+encodeURIComponent(id),{method:'DELETE'});await loadSidebar();}
    catch(e){setError(e.message);}
  }
  async function addUser(e){e.preventDefault();try{await api('/admin/users',json('POST',newUser));setNewUser({username:'',password:'',role:'user'});const data=await api('/admin/users');setUsers(data.users);}catch(e){setError(e.message);}}
  async function chooseTab(t){setTab(t);setError('');if(t==='admin'){try{setUsers((await api('/admin/users')).users);}catch(e){setError(e.message);}}}
  async function diagnoseDevice(id){
    setError('');setDiagBusy(id);
    try {const result=await api(`/devices/${encodeURIComponent(id)}/diagnostics`);setDeviceDiagnostics(v=>({...v,[id]:result.diagnostics}));}
    catch(e){setError(e.message);}finally{setDiagBusy('');}
  }
  async function renameChat(){
    if(!current)return;
    const title=window.prompt('Nuovo titolo della conversazione (max 160 caratteri)',current.title)?.trim();
    if(!title||title===current.title)return;
    try{await api(`/chats/${chatId}`,json('PATCH',{title}));await loadSidebar();}
    catch(e){setError(e.message);}
  }
  async function deleteChat(){
    if(!current||!window.confirm('Eliminare definitivamente questa chat e la sessione OpenCode locale? Il PC deve essere online.'))return;
    try{await api(`/chats/${chatId}`,{method:'DELETE'});setChatId(null);setSending(false);await loadSidebar();}
    catch(e){setError(e.message);}
  }
  async function toggleUser(u){
    const next=!Boolean(u.active);
    if(!window.confirm(`${next?'Riattivare':'Disattivare'} l'account ${u.username}?${next?'':' Verranno revocate le sessioni browser e chiuse le connessioni dei suoi PC.'}`))return;
    try{await api(`/admin/users/${encodeURIComponent(u.id)}/status`,json('PATCH',{active:next}));setUsers((await api('/admin/users')).users);}
    catch(e){setError(e.message);}
  }
  return <div className="app">
    <aside className={'sidebar '+(!sidebar?'collapsed':'')}>
      <div className="brand"><span className="brand-icon"><Bot size={21}/></span>{sidebar&&<>OpenCode <em>Workspace</em></>}</div>
      <button className="new-chat" onClick={newChat} disabled={busy} title="Nuova chat"><Plus size={18}/>{sidebar&&' Nuova chat'}</button>
      {sidebar&&<><div className="side-label">LE MIE CONVERSAZIONI</div><div className="chat-list">{chats.length===0&&<span className="side-empty">Nessuna chat. Creane una.</span>}{chats.map(c=><button key={c.id} onClick={()=>{setChatId(c.id);setTab('chat');}} className={'chat-row '+(chatId===c.id&&tab==='chat'?'active':'')}><span className="chat-dot"/><span className="truncate">{c.title}</span></button>)}</div></>}
      <div className="side-bottom"><button className={tab==='devices'?'active':''} onClick={()=>chooseTab('devices')}><Monitor size={18}/>{sidebar&&' I miei PC'}</button>{user.role==='admin'&&<button className={tab==='admin'?'active':''} onClick={()=>chooseTab('admin')}><Shield size={18}/>{sidebar&&' Amministrazione'}</button>}<button onClick={()=>setSidebar(s=>!s)}><PanelLeftClose size={18}/>{sidebar&&' Comprimi menu'}</button><div className="profile"><div className="avatar">{user.username[0].toUpperCase()}</div>{sidebar&&<><div className="truncate"><b>{user.username}</b><small>{user.role==='admin'?'Amministratore':'Utente'}</small></div><button title="Esci" onClick={onLogout}><LogOut size={18}/></button></>}</div></div>
    </aside>
    <section className="main"><header className="topbar"><div className="top-title">{tab==='chat'?<><span>{current?.title||'Nuova conversazione'}</span><small>{currentPc?.name||'Seleziona una chat'}</small></>:tab==='devices'?'I miei computer':'Amministrazione'}</div><div className="top-right">{tab==='chat'&&current&&<button className="icon-btn" title="Rinomina chat" onClick={renameChat}><Pencil size={16}/></button>}{tab==='chat'&&current&&<button className="icon-btn" title="Elimina chat e sessione OpenCode" onClick={deleteChat}><Trash2 size={16}/></button>}{tab==='chat'&&current&&<button className="icon-btn" title="Verifica stato OpenCode" onClick={refreshStatus} disabled={statusBusy}><Activity size={16}/></button>}{tab==='chat'&&current&&<button className="icon-btn" title="Sincronizza chat" onClick={()=>api(`/chats/${chatId}/sync`,json('POST',{})).then(()=>loadMessages(chatId)).catch(e=>setError(e.message))}><RefreshCw size={16}/></button>}{tab==='chat'&&current&&<span className={'status '+(currentPc?.online?'online':'offline')}>{currentPc?.online?<Wifi size={15}/>:<WifiOff size={15}/>} {currentPc?.online?'PC online':'PC offline'}</span>}<span className="profile-pill">{user.username}</span></div></header>
    {tab==='chat'&&chatId&&sessionStatus&&<div className="status-detail" role="status">OpenCode: {sessionStatus.opencodeStatus} · Lavori pendenti: {sessionStatus.pendingJobs} <button onClick={()=>setSessionStatus(null)} aria-label="Chiudi stato">×</button></div>}{error&&<div className="alert"><span>{error}</span><button onClick={()=>setError('')}>×</button></div>}
    {tab==='devices'?<div className="page"><div className="page-heading"><div><h1>Computer collegati</h1><p className="muted">Associa il connettore OpenCode installato sul tuo PC Windows.</p></div><button className="secondary" onClick={loadSidebar}><RefreshCw size={16}/> Aggiorna</button></div><div className="device-grid">{devices.map(pc=><div className="device-card" key={pc.id}><Monitor size={25}/><h3>{pc.name}</h3><span className={'status '+(pc.online?'online':'offline')}>{pc.online?'● Online':'○ Offline'}</span><button className="secondary" onClick={()=>{setSelectedPc(pc.id);setTab('chat');}} disabled={!pc.online}>Usa questo PC →</button><button className="secondary" onClick={()=>diagnoseDevice(pc.id)} disabled={!pc.online||diagBusy===pc.id}><Activity size={15}/> {diagBusy===pc.id?'Controllo...':'Diagnostica OpenCode'}</button>{deviceDiagnostics[pc.id]&&<div className="diagnostic"><b>{deviceDiagnostics[pc.id].healthy?'OpenCode pronto':'OpenCode non pronto'}</b><small>Versione: {deviceDiagnostics[pc.id].version}</small><small>Directory: {deviceDiagnostics[pc.id].workdir}</small><small>Porta: {deviceDiagnostics[pc.id].port}</small></div>}<button className="secondary" onClick={()=>revokeDevice(pc.id)}>Revoca accesso</button></div>)}</div><div className="panel"><h2>Associa un nuovo PC</h2><p className="muted">Genera un codice temporaneo e inseriscilo in <code>PAIR_CODE</code> nel file <code>.env</code> del connettore. Scade dopo 10 minuti.</p><button className="primary" onClick={pair}><Plus size={17}/> Genera codice</button>{pairCode&&<div className="code-box"><code>{pairCode}</code><button className="icon-btn" title="Copia codice" onClick={()=>navigator.clipboard.writeText(pairCode)}><Copy size={16}/></button></div>}</div></div>
    :tab==='admin'?<div className="page"><h1>Gestione utenti</h1><p className="muted">Crea gli accessi personali. Ogni utente vede solo le proprie chat e i propri PC.</p><div className="panel"><h2>Nuovo utente</h2><form className="admin-form" onSubmit={addUser}><label>Username<input value={newUser.username} onChange={e=>setNewUser({...newUser,username:e.target.value})} minLength={3} required/></label><label>Password iniziale<input type="password" value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})} minLength={12} required/></label><label>Ruolo<select value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})}><option value="user">Utente</option><option value="admin">Amministratore</option></select></label><button className="primary">Crea account</button></form></div><div className="panel"><h2>Account</h2>{users.map(u=><div className="user-row" key={u.id}><span className="avatar">{u.username[0].toUpperCase()}</span><b>{u.username}</b><span className="muted">{u.role} · {u.active?'Attivo':'Disattivato'}</span><button className="secondary" onClick={()=>toggleUser(u)} disabled={u.id===user.id}>{u.active?'Disattiva':'Riattiva'}</button></div>)}</div></div>
    :!chatId?<div className="empty-chat"><div className="welcome-icon"><Bot size={36}/></div><h1>Che cosa vuoi creare oggi?</h1><p>Seleziona un PC Windows collegato. OpenCode potrà lavorare sui progetti autorizzati e mostrarti i risultati qui.</p><div className="create-card"><label>Computer da utilizzare</label><select value={selectedPc} onChange={e=>setSelectedPc(e.target.value)}><option value="">Seleziona un PC...</option>{devices.filter(d=>d.online).map(pc=><option value={pc.id} key={pc.id}>{pc.name}</option>)}</select><button className="primary" onClick={newChat} disabled={!selectedPc||busy}><Plus size={17}/> Crea conversazione</button></div></div>
    :<><div className="conversation"><div className="conversation-inner">{messages.length===0&&<div className="initial-hint"><Bot size={30}/><h2>Inizia a lavorare con OpenCode</h2><p>Puoi chiedere analisi del codice, correzioni e operazioni sui file. I comandi sensibili richiedono la tua approvazione.</p></div>}{messages.map(m=><div className={'message '+m.role} key={m.id}><div className={'message-icon '+m.role}>{m.role==='assistant'?<Bot size={17}/>:user.username[0].toUpperCase()}</div><div className="message-body"><div className="message-label">{m.role==='assistant'?'OpenCode':'Tu'}</div><div className="message-text">{m.content||((m.parts_json?.length||0)>0?'Operazione completata':'')}</div>{Array.isArray(m.parts_json)&&m.parts_json.filter(p=>p.type==='tool').map((p,i)=><ToolDetails part={p} key={p.id||i}/>)}</div></div>)}{Object.values(partial).some(Boolean)&&<div className="message assistant"><div className="message-icon assistant"><Bot size={17}/></div><div className="message-body"><div className="message-label">OpenCode · in corso</div><div className="message-text">{Object.values(partial).join('\n')}</div></div></div>}{liveTools.length>0&&<div className="live-tool-list"><div className="live-tools-label">Strumenti in tempo reale</div>{liveTools.map(tool=><ToolDetails part={tool} live key={tool.id}/>)}</div>}{permissions.map(p=><div className="permission" key={p.request_id}><div><Shield size={18}/><b>OpenCode richiede autorizzazione</b></div><pre>{JSON.stringify(p.details_json,null,2).slice(0,1600)}</pre><div className="permission-actions"><button className="danger" onClick={()=>answer(p.request_id,'reject')}><XCircle size={15}/> Rifiuta</button><button className="primary" onClick={()=>answer(p.request_id,'once')}><CheckCircle2 size={15}/> Consenti una volta</button></div></div>)}{activity.length>0&&<details className="events"><summary>Attività OpenCode ({activity.length})</summary>{activity.slice(-10).map(a=><div key={a.id}><Terminal size={13}/>{a.detail}</div>)}</details>}<div ref={scroll}/></div></div><form className="composer-wrap" onSubmit={send}><div className="composer"><textarea rows={2} placeholder="Scrivi un messaggio a OpenCode..." value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}/><div className="composer-footer"><span className="composer-machine"><Monitor size={14}/> {currentPc?.name||'PC'}</span><label className="model-control" title="Modello OpenCode da usare per questo messaggio"><span>Modello</span><select aria-label="Modello AI" value={selectedModel} onChange={e=>setSelectedModel(e.target.value)} disabled={modelBusy||!currentPc?.online}><option value="">{modelBusy?'Caricamento...':'Predefinito OpenCode'}</option>{models.map(m=><option key={m.providerID+'|'+m.modelID} value={JSON.stringify({providerID:m.providerID,modelID:m.modelID})}>{m.providerName} · {m.name}</option>)}</select></label><div>{(sending||runningJobs.length>0)&&<button type="button" className="secondary stop" title="Interrompi" onClick={abort}><Square size={14}/></button>}<button className="primary send" title="Invia" disabled={!draft.trim()||sending||runningJobs.length>0}><Send size={17}/></button></div></div></div>{runningJobs.some(job=>job.error_text)&&<div className="recovery-warning" role="status">⚠ Esecuzione con esito incerto. Nessun prompt verrà reinviato automaticamente. Esamina i risultati, poi puoi chiudere il blocco senza dichiararlo riuscito. <button type="button" className="secondary" onClick={resolveUncertain}>Ho verificato · sblocca chat</button></div>}<p className="composer-hint">{runningJobs.length>0?"Operazione in corso o in recupero: attendi, sincronizza o premi Interrompi. ":""}OpenCode può modificare file sul PC. Esamina le approvazioni prima di consentire operazioni.</p></form></>}
    </section>
  </div>;
}
export default function App(){
  const [user,setUser]=useState(undefined);
  useEffect(()=>{api('/me').then(x=>setUser(x.user)).catch(()=>setUser(null));},[]);
  async function logout(){try{await api('/auth/logout',json('POST',{}));}finally{setUser(null);}}
  if(user===undefined)return <div className="splash">OpenCode Workspace</div>;
  return user?<Workspace user={user} onLogout={logout}/>:<Login onLogin={setUser}/>;
}
