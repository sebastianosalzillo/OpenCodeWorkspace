import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalOpenCode } from '../src/opencode.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('riconnessione busy -> idle non ritrasmette prompt e non marca il job come completed', async () => {
  const dir=await mkdtemp(join(tmpdir(),'ocw-uncertain-'));
  const events=[];
  let statusReads=0;
  const calls=[];
  const server=createServer((req,res)=>{
    calls.push(req.method+' '+req.url);
    res.setHeader('Content-Type','application/json');
    if(req.url==='/session/status'){
      statusReads++;
      return res.end(statusReads===1?JSON.stringify({ses_old:{type:'busy'}}):'{}');
    }
    if(req.url==='/session/ses_old/message')return res.end(JSON.stringify([
      {info:{id:'old-answer',role:'assistant',time:{completed:1}},parts:[{type:'text',text:'Vecchia risposta'}]}
    ]));
    if(req.url==='/session/ses_old/abort' && req.method==='POST')return res.end('{}');
    res.writeHead(404).end('{}');
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    process.env.OPENCODE_PORT=String(server.address().port);
    process.env.OPENCODE_WORKDIR=dir;
    process.env.OPENCODE_SERVER_PASSWORD='very-long-password-for-tests';
    const oc=new LocalOpenCode(evt=>events.push(evt));
    oc.pollIntervalMs=15;
    oc.sessionToChat.set('ses_old','chat-old');
    const recovery=await oc.command('recover',{chatId:'chat-old',sessionId:'ses_old'});
    assert.deepEqual(recovery,{running:true,completed:false,unresolved:false});
    for(let i=0;i<40 && !events.some(e=>e.event?.type==='workspace.recovery');i++)await sleep(20);
    assert.ok(events.some(e=>e.event?.type==='workspace.recovery'),'esito incerto deve essere visibile');
    assert.ok(events.some(e=>e.type==='messages'),'cronologia recuperata');
    assert.ok(events.filter(e=>e.type==='messages').every(e=>e.done===false),'job non completato senza evidenza');
    assert.equal(calls.filter(c=>c.includes('prompt_async')).length,0,'prompt non ritrasmesso');
    await oc.command('abort',{chatId:'chat-old',sessionId:'ses_old'});
    assert.ok(events.filter(e=>e.type==='messages').every(e=>e.done===false),'abort non finge una risposta conclusa');
    assert.equal(oc.recovering.has('ses_old'),false);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
    delete process.env.OPENCODE_PORT;
    delete process.env.OPENCODE_WORKDIR;
    delete process.env.OPENCODE_SERVER_PASSWORD;
  }
});
