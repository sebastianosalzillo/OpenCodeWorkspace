import 'dotenv/config';
import { LocalOpenCode } from '../src/opencode.js';

// Prova controllata su OpenCode REALE. Senza --session non crea alcun dato.
const withSession = process.argv.includes('--session');
let sessionId;
try {
  const client = new LocalOpenCode(()=>{});
  const info = await client.command('diagnostics', {});
  if(!info.healthy)throw new Error('Health check fallito');
  console.log('OpenCode collegato:', {healthy:info.healthy,version:info.version,port:info.port,workdir:info.workdir});
  const models = await client.command('models', {});
  console.log('Modelli dei provider collegati:', models.models.length);
  if(withSession) {
    const chatId = 'smoke-'+Date.now();
    const result = await client.command('create-session', {chatId,title:'OpenCode Workspace smoke test'});
    sessionId = result.id;
    console.log('Creazione sessione: OK');
    await client.command('delete-session', {chatId,sessionId});
    sessionId = null;
    console.log('Eliminazione sessione: OK');
  }
  console.log('Smoke test completato. Nessun prompt AI eseguito.');
}catch(err){
  console.error('Smoke test fallito:',err.message);
  if(sessionId)console.error('Attenzione: verificare sul PC se la sessione di prova è rimasta aperta.');
  process.exitCode=1;
}
