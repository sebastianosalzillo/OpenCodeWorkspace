'use strict';
const $ = (id) => document.getElementById(id);
let prev = null;
let lastConfigFingerprint = null;
function report(message, error = false) {
  $('message').textContent = message;
  $('message').classList.toggle('error',error);
}
async function run(action, success) {
  try { await action(); if(success)report(success); await refresh(); }
  catch(error) {report(error.message||String(error),true);await refresh();}
}
function render(data) {
  prev = data;
  const s = data.settings || {};
  const fingerprint = JSON.stringify(s);
  if (fingerprint !== lastConfigFingerprint) {
    const set = (key,val) => {$(key).value=val??'';};
    set('serverUrl',s.serverUrl||'http://localhost:3000');
    set('name',s.name||'PC-WINDOWS');
    set('port',s.opencodePort||4096);
    set('workdir',s.workdir||'C:\\AI-Workspace');
    $('password').value='';
    $('password').required=!s.passwordConfigured;
    $('password').placeholder=s.passwordConfigured?'Lascia vuoto per mantenere la password':'Minimo 16 caratteri';
    $('startOpenCode').checked=s.autoStartOpenCode??true;
    $('loginItem').checked=s.launchAtLogin??true;
    lastConfigFingerprint=fingerprint;
  }
  const status=data.running?'In esecuzione':data.paired?'Associato · fermo':data.configured?'Da associare':'Da configurare';
  $('state').textContent=status;
  $('state').classList.toggle('good',data.running);
  $('runningState').textContent=data.running?'Attivo':'Fermo';
  $('pairStatus').textContent=data.paired?'Associato':'Non associato';
  $('deviceId').textContent=s.deviceId?'ID dispositivo: '+s.deviceId:'';
  $('pair').disabled=!data.configured||data.paired;
  $('pairCode').disabled=data.paired;
  $('start').disabled=!data.paired||data.running;
  $('stop').disabled=!data.running;
  $('disconnect').disabled=!data.paired||data.running;
  $('save').disabled=data.running;
  $('logs').textContent=[...(data.logs||[]),...(data.error?['ERRORE: '+data.error]:[])].join('\n')||'Nessun evento registrato.';
}
async function refresh(){render(await window.workspace.status());}
window.workspace.onStatus(render);
$('settingsForm').addEventListener('submit', e=>{
  e.preventDefault();
  const payload={serverUrl:$('serverUrl').value,name:$('name').value,
    opencodePort:Number($('port').value),workdir:$('workdir').value,
    opencodePassword:$('password').value,autoStartOpenCode:$('startOpenCode').checked,
    launchAtLogin:$('loginItem').checked};
  run(()=>window.workspace['save-settings'](payload),'Configurazione salvata in modo cifrato.');
});
$('browse').addEventListener('click',async()=>{try{const dir=await window.workspace['choose-directory']();if(dir)$('workdir').value=dir;}catch(e){report(e.message,true);}});
$('pair').addEventListener('click',()=>run(()=>window.workspace.pair($('pairCode').value),'PC associato correttamente. Ora puoi avviare il connettore.'));
$('start').addEventListener('click',()=>run(()=>window.workspace.start(),'Avvio richiesto. Controlla la diagnostica.'));
$('stop').addEventListener('click',()=>run(()=>window.workspace.stop(),'Connettore fermato.'));
$('disconnect').addEventListener('click',()=>{
  if(window.confirm('Eliminare le credenziali locali? Per revocare l’accesso elimina anche il PC dal portale.'))
    run(()=>window.workspace.disconnect(),'Associazione rimossa sul PC.');
});
$('refresh').addEventListener('click',()=>run(refresh));
refresh().catch(e=>report(e.message,true));
