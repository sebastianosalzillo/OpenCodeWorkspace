import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalOpenCode } from '../src/opencode.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
test('modello selezionato: inoltra i due ID validi, esclude segreti e rifiuta provider non collegati', async () => {
  const workdir=await mkdtemp(join(tmpdir(),'ocw-model-'));
  const calls=[];
  let prompted=false;
  const server=createServer(async(req,res)=>{
    let body='';for await (const chunk of req)body+=chunk;
    calls.push({path:req.url,method:req.method,body:body?JSON.parse(body):null});
    res.setHeader('Content-Type','application/json');
    if(req.url==='/global/health')return res.end(JSON.stringify({healthy:true}));
    if(req.url==='/provider')return res.end(JSON.stringify({connected:['local'],all:[
      {id:'local',name:'Locale',options:{apiKey:'HIDDEN_CREDENTIAL'},models:{'small-model':{name:'Small',apiKey:'DONOTLEAK'}}},
      {id:'unconnected',models:{'large-model':{name:'Private'}}}
    ]}));
    if(req.url==='/session/test-session/message')return res.end(JSON.stringify(prompted ? [{info:{role:'assistant',id:'new-id',time:{completed:1}},parts:[{type:'text',text:'ok'}]}] : []));
    if(req.url==='/session/status')return res.end('{}');
    if(req.url==='/session/test-session/prompt_async'){
      prompted=true;res.writeHead(204).end();return;
    }
    res.writeHead(404).end(JSON.stringify({error:'unknown path'}));
  });
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    process.env.OPENCODE_PORT=String(server.address().port);
    process.env.OPENCODE_WORKDIR=workdir;
    process.env.OPENCODE_SERVER_PASSWORD='very-long-test-password';
    const events=[];
    const agent=new LocalOpenCode(message=>events.push(message));
    agent.pollIntervalMs=15;
    const {models}=await agent.command('models',{});
    assert.deepEqual(models,[{providerID:'local',modelID:'small-model',name:'Small',providerName:'Locale'}]);
    assert.equal(JSON.stringify(models).includes('HIDDEN_CREDENTIAL'),false);
    assert.deepEqual(await agent.command('status',{chatId:'chat',sessionId:'test-session'}),{status:'idle'});
    await assert.rejects(()=>agent.command('prompt',{chatId:'chat',sessionId:'test-session',text:'hello',model:{providerID:'unconnected',modelID:'large-model'}}),/non disponibile/);
    assert.equal(calls.filter(c=>c.path.endsWith('prompt_async')).length,0);
    const selected={providerID:'local',modelID:'small-model'};
    await agent.command('prompt',{chatId:'chat',sessionId:'test-session',text:'hello',model:selected});
    const request=calls.find(c=>c.path==='/session/test-session/prompt_async');
    assert.deepEqual(request.body,{parts:[{type:'text',text:'hello'}],model:selected});
    for(let tries=0;tries<60 && !events.some(e=>e.done);tries++)await sleep(15);
    assert.ok(events.some(e=>e.done),'la risposta completata deve terminare il job');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await rm(workdir,{recursive:true,force:true});
    delete process.env.OPENCODE_PORT;delete process.env.OPENCODE_WORKDIR;delete process.env.OPENCODE_SERVER_PASSWORD;
  }
});
