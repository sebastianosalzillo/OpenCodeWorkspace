import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalOpenCode } from '../src/opencode.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('mock OpenCode: sessioni, prompt asincroni, recover e permessi senza reinvio', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-workspace-test-'));
  const calls = [];
  const events = [];
  let statusReads = 0;
  let promptStarted = false;
  const server = createServer(async (req,res) => {
    calls.push(`${req.method} ${req.url}`);
    const expected = 'Basic ' + Buffer.from('opencode:very-long-password-for-tests').toString('base64');
    if (req.headers.authorization !== expected) {
      res.writeHead(401).end(); return;
    }
    const respond = (data,code=200) => {
      res.writeHead(code, {'Content-Type':'application/json'});
      res.end(code===204 ? undefined : JSON.stringify(data));
    };
    if(req.url==='/global/health')return respond({healthy:true,version:'test'});
    if(req.url==='/session' && req.method==='POST')return respond({id:'ses_new'});
    if(req.url==='/session/ses_new/prompt_async' && req.method==='POST'){promptStarted=true;return respond(undefined,204);}
    if(req.url==='/session/status') {
      if(promptStarted)statusReads += 1;
      return respond(promptStarted && statusReads===1 ? {ses_new:{type:'busy'}} : {});
    }
    if(req.url==='/session/ses_new/message')return respond([{info:{id:'m1',role:'assistant',time:{completed:123}},parts:[{type:'text',text:'OK'}]}]);
    if(req.url==='/session/ses_saved/message')return respond([{info:{id:'m2',role:'assistant',time:{completed:1}},parts:[{type:'text',text:'Risposta salvata'}]}]);
    if(req.url==='/permission/permission1/reply' && req.method==='POST')return respond(true);
    if(req.url==='/session/ses_new/abort' && req.method==='POST')return respond(true);
    respond({error:'unknown'},404);
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    process.env.OPENCODE_PORT=String(server.address().port);
    process.env.OPENCODE_WORKDIR=dir;
    process.env.OPENCODE_SERVER_PASSWORD='very-long-password-for-tests';
    const client=new LocalOpenCode(evt=>events.push(evt));
    client.pollIntervalMs=15;
    await client.ready();
    assert.deepEqual(await client.command('create-session',{chatId:'chat1',title:'Prova'}),{id:'ses_new'});
    assert.deepEqual(await client.command('restore-sessions',{sessions:[{chatId:'chat2',sessionId:'ses_saved'}]}),{restored:1});
    assert.equal(client.sessionToChat.get('ses_saved'),'chat2');
    await assert.rejects(()=>client.command('restore-sessions',{sessions:[{chatId:'x',sessionId:null}]}),/non valida/);

    const restored=await client.command('recover',{chatId:'chat2',sessionId:'ses_saved'});
    assert.equal(restored.completed,true);
    assert.equal(events.at(-1).done,true);
    assert.equal(calls.filter(x=>x.includes('prompt_async')).length,0);

    assert.deepEqual(await client.command('prompt',{chatId:'chat1',sessionId:'ses_new',text:'Test'}),{accepted:true});
    for(let attempt=0;attempt<80 && !events.some(e=>e.chatId==='chat1' && e.done);attempt++)await pause(20);
    assert.ok(events.some(e=>e.chatId==='chat1' && e.done),'La risposta asincrona deve essere sincronizzata');
    assert.equal(calls.filter(x=>x==='POST /session/ses_new/prompt_async').length,1,'nessun doppio prompt');

    await client.command('permission-reply',{chatId:'chat1',sessionId:'ses_new',requestId:'permission1',decision:'once'});
    assert.ok(calls.includes('POST /permission/permission1/reply'));
    await client.command('abort',{chatId:'chat1',sessionId:'ses_new'});
    assert.ok(calls.includes('POST /session/ses_new/abort'));
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
    delete process.env.OPENCODE_PORT;
    delete process.env.OPENCODE_WORKDIR;
    delete process.env.OPENCODE_SERVER_PASSWORD;
  }
});
