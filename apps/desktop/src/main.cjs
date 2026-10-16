'use strict';
const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, safeStorage, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const { readFile, mkdir, writeFile, rename } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { join, dirname } = require('node:path');
const os = require('node:os');
const { validateSettings } = require('./settings.cjs');

if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => reveal());

let mainWindow;
let tray;
let agent;
let quitting = false;
let stored = null;
let errorText = '';
const logLines = [];
const pushLog = (line) => {
  let safe = String(line).replace(/[0-9a-f]{64}/gi, '[redacted-token]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]');
  if (stored?.opencodePassword) safe=safe.split(stored.opencodePassword).join('[redacted-password]');
  logLines.push(`[${new Date().toLocaleTimeString()}] ${safe.slice(0,400)}`);
  if (logLines.length > 120) logLines.splice(0, logLines.length - 120);
  announce();
};
function filePath() { return join(app.getPath('userData'), 'settings.secure.json'); }
function cryptoReady() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Protezione credenziali di Windows non disponibile; impossibile continuare in sicurezza');
}
async function loadConfig() {
  try {
    const envelope=JSON.parse(await readFile(filePath(),'utf8'));
    if (envelope.version!==1 || typeof envelope.encrypted!=='string')throw new Error('Configurazione danneggiata');
    cryptoReady();
    stored=JSON.parse(safeStorage.decryptString(Buffer.from(envelope.encrypted,'base64')));
  } catch(e) {
    if (e.code!=='ENOENT') throw e;
    stored=null;
  }
}
async function persistConfig(config) {
  cryptoReady();
  const encrypted=safeStorage.encryptString(JSON.stringify(config)).toString('base64');
  const destination=filePath();
  await mkdir(dirname(destination),{recursive:true});
  const temp=destination+'.tmp';
  await writeFile(temp,JSON.stringify({version:1,encrypted}),{mode:0o600});
  await rename(temp,destination);
  stored=config;
}
function snapshot() {
  const s=stored;
  return {
    configured:!!s,
    paired:!!s?.token,
    running:!!agent && agent.exitCode===null && !agent.killed,
    error:errorText,
    logs:logLines.slice(-40),
    settings:s?{
      serverUrl:s.serverUrl, workdir:s.workdir, opencodePort:s.opencodePort,
      name:s.name, autoStartOpenCode:s.autoStartOpenCode,
      launchAtLogin:s.launchAtLogin, passwordConfigured:!!s.opencodePassword,
      deviceId:s.deviceId||null
    }:null
  };
}
function announce() {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed())
    mainWindow.webContents.send('workspace:status',snapshot());
}
function reveal(){ if(mainWindow){mainWindow.show();mainWindow.restore();mainWindow.focus();} }
function updateLoginItem(enabled) {
  if(process.platform==='win32' && app.isPackaged){
    app.setLoginItemSettings({openAtLogin:enabled,openAsHidden:true,args:['--hidden']});
  }
}
function stopAgent(){
  if(!agent)return;
  const proc=agent;
  agent=null;
  proc.removeAllListeners('exit');
  if(!proc.killed)proc.kill();
  pushLog('Connettore fermato');
}
function startAgent(){
  if(agent)return;
  if(!stored?.token || !stored?.deviceId)throw new Error('Associa prima il PC tramite codice temporaneo');
  if(process.platform!=='win32')throw new Error('Il connettore desktop è progettato per Windows');
  const bundled=join(__dirname,'../dist/connector.cjs');
  if(!existsSync(bundled))throw new Error('Connettore non compilato. Esegui npm run bundle -w @workspace/desktop');
  const env={...process.env,ELECTRON_RUN_AS_NODE:'1',
    WORKSPACE_URL:stored.serverUrl,WORKSPACE_DEVICE_ID:stored.deviceId,WORKSPACE_DEVICE_TOKEN:stored.token,
    DEVICE_NAME:stored.name,OPENCODE_WORKDIR:stored.workdir,
    OPENCODE_PORT:String(stored.opencodePort),OPENCODE_SERVER_PASSWORD:stored.opencodePassword,
    AUTO_START_OPENCODE:String(stored.autoStartOpenCode)};
  const proc=spawn(process.execPath,[bundled],{cwd:stored.workdir,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  agent=proc;
  errorText='';
  pushLog('Avvio del connettore...');
  for(const stream of [proc.stdout,proc.stderr]){
    stream.setEncoding('utf8');
    stream.on('data',chunk=>{
      for(const line of chunk.split(/\r?\n/).filter(Boolean))pushLog(line);
    });
  }
  proc.on('error',e=>{errorText=`Impossibile avviare il processo: ${e.message}`;pushLog(errorText);});
  proc.on('exit',(code,signal)=>{
    if(agent===proc)agent=null;
    const desc=`Connettore terminato (codice ${code}, segnale ${signal||'nessuno'})`;
    pushLog(desc);
    if(!quitting)errorText=desc;
    announce();
  });
  announce();
}
async function pairWithServer(code){
  if(!stored)throw new Error('Prima salva la configurazione');
  if(stored.token)throw new Error('PC già associato. Per cambiare server devi disassociare il PC dalla dashboard.');
  if(!/^[0-9a-f]{24}$/i.test(String(code||'')))throw new Error('Il codice deve contenere 24 caratteri esadecimali');
  const response=await fetch(stored.serverUrl+'/api/connectors/pair',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code:String(code).toLowerCase(),name:stored.name}),
    signal:AbortSignal.timeout(12000)
  });
  const payload=await response.json();
  if(!response.ok)throw new Error(String(payload.error||'Associazione non riuscita').slice(0,200));
  if(!/^[0-9a-f]{64}$/.test(payload.token)||!/^[-a-f\d]{36}$/i.test(payload.deviceId))
    throw new Error('Risposta di associazione non valida');
  await persistConfig({...stored,deviceId:payload.deviceId,token:payload.token});
  pushLog('Dispositivo associato correttamente (credenziali protette con Windows)');
  return {deviceId:payload.deviceId};
}
function registerHandlers(){
  ipcMain.handle('workspace:status',()=>snapshot());
  ipcMain.handle('workspace:save-settings',async(_event,input)=>{
    if(agent)throw new Error('Ferma il connettore prima di modificare la configurazione');
    const config=validateSettings({...input,opencodePassword:input?.opencodePassword||stored?.opencodePassword});
    if(stored?.token && stored.serverUrl!==config.serverUrl)
      throw new Error('Per cambiare server, prima revoca il dispositivo dalla dashboard e disassocialo');
    await mkdir(config.workdir,{recursive:true});
    await persistConfig({...config,deviceId:stored?.deviceId||null,token:stored?.token||null});
    updateLoginItem(config.launchAtLogin);
    pushLog('Configurazione salvata');
    return snapshot();
  });
  ipcMain.handle('workspace:pair',async(_event,code)=>{const result=await pairWithServer(code);announce();return result;});
  ipcMain.handle('workspace:start',()=>{startAgent();return snapshot();});
  ipcMain.handle('workspace:stop',()=>{stopAgent();return snapshot();});
  ipcMain.handle('workspace:disconnect',async()=>{
    if(agent)throw new Error('Ferma prima il connettore');
    if(!stored) return snapshot();
    await persistConfig({...stored,deviceId:null,token:null});
    pushLog('Credenziali locali cancellate. Revoca anche il PC dal portale Workspace.');
    return snapshot();
  });
  ipcMain.handle('workspace:choose-directory',async()=>{
    const r=await dialog.showOpenDialog(mainWindow,{properties:['openDirectory','createDirectory']});
    return r.canceled?null:r.filePaths[0];
  });
  ipcMain.handle('workspace:set-autostart',async(_event,enabled)=>{
    if(!stored)throw new Error('Salva prima la configurazione');
    if(typeof enabled!=='boolean')throw new Error('Parametro non valido');
    await persistConfig({...stored,launchAtLogin:enabled});
    updateLoginItem(enabled);return snapshot();
  });
}
function createTray(){
  const icon=join(__dirname,'../assets/icon.ico');
  tray=new Tray(nativeImage.createFromPath(icon));
  tray.setToolTip('OpenCode Workspace Connector');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Apri OpenCode Workspace Connector',click:reveal},
    {label:'Avvia connettore',click:()=>{try{startAgent();}catch(e){errorText=e.message;announce();reveal();}}},
    {label:'Ferma connettore',click:stopAgent},
    {type:'separator'},
    {label:'Esci',click:()=>{quitting=true;app.quit();}}
  ]));
  tray.on('double-click',reveal);
}
app.whenReady().then(async()=>{
  registerHandlers();
  try{await loadConfig();}catch(e){errorText=e.message;}
  mainWindow=new BrowserWindow({
    width:830,height:745,minWidth:650,minHeight:600,show:false,
    icon:join(__dirname,'../assets/icon.ico'),title:'OpenCode Workspace Connector',
    webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,
      nodeIntegration:false,sandbox:true,webSecurity:true}
  });
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',e=>e.preventDefault());
  await mainWindow.loadFile(join(__dirname,'index.html'));
  createTray();
  if(stored){updateLoginItem(stored.launchAtLogin);if(stored.token){try{startAgent();}catch(e){errorText=e.message;pushLog(errorText);}}}
  if(!process.argv.includes('--hidden')||!stored?.token)reveal();
  mainWindow.on('close',e=>{if(!quitting){e.preventDefault();mainWindow.hide();}});
}).catch(e=>{dialog.showErrorBox('OpenCode Workspace',e.message);app.quit();});
app.on('before-quit',()=>{quitting=true;stopAgent();});
app.on('window-all-closed',()=>{});
