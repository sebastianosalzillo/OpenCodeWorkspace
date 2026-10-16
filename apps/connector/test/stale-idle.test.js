import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalOpenCode } from '../src/opencode.js';

test('evento idle vecchio non conclude il nuovo prompt senza una nuova risposta assistant', async () => {
  const dir=await mkdtemp(join(tmpdir(),'ocw-stale-'));
  const outbound=[];
  let newAnswer=false;
  const server=createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/session/ses_1/message')return res.end(JSON.stringify([
      {info:{id:'assistant-old',role:'assistant',time:{completed:1}},parts:[{type:'text',text:'vecchio'}]},
      ...(newAnswer?[{info:{id:'assistant-new',role:'assistant',time:{completed:2}},parts:[{type:'text',text:'nuovo'}]}]:[])
    ]));
    if(req.url==='/session/ses_1/prompt_async')return res.writeHead(204).end();
    if(req.url==='/session/status')return res.end(JSON.stringify({ses_1:{type:'busy'}}));
    res.writeHead(404).end('{}');
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    process.env.OPENCODE_PORT=String(server.address().port);
    process.env.OPENCODE_WORKDIR=dir;
    process.env.OPENCODE_SERVER_PASSWORD='very-long-password-for-tests';
    const oc=new LocalOpenCode(data=>outbound.push(data));
    oc.pollIntervalMs=3;
    await oc.command('prompt',{chatId:'chat-one',sessionId:'ses_1',text:'Nuova richiesta'});
    await oc.finish('ses_1'); // session.idle arrivato dall'esecuzione precedente
    assert.equal(outbound.some(e=>e.done===true),false);
    newAnswer=true;
    await oc.finish('ses_1');
    assert.equal(outbound.filter(e=>e.done===true).length,1);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
    delete process.env.OPENCODE_PORT;
    delete process.env.OPENCODE_WORKDIR;
    delete process.env.OPENCODE_SERVER_PASSWORD;
  }
});
