import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalOpenCode} from '../src/opencode.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('stream OpenCode ricompone SSE spezzato e sincronizza dopo reconnect senza prompt',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ocw-stream-'));
  const output=[];
  let connections=0,promptCalls=0, syncCalls=0;
  const payload=JSON.stringify({type:'message.part.updated',properties:{part:{sessionID:'ses_live',type:'text',id:'part1',text:'Saluti 🚀'}}});
  const data=Buffer.from(`data: ${payload}\r\n\r\n`);
  const emojiIndex=data.indexOf(Buffer.from('🚀')[0]);
  const server=createServer((req,res)=>{
    if(req.url==='/event'){
      connections++;
      res.writeHead(200,{'content-type':'text/event-stream'});
      if(connections===1){
        res.write(data.subarray(0,emojiIndex+2));
        res.write(data.subarray(emojiIndex+2,data.length-1));
        res.end(data.subarray(data.length-1));
      }else{
        // La seconda connessione rimane aperta fino all'abort.
        req.on('close',()=>res.end());
        res.write(': connected\n\n');
      }
      return;
    }
    if(req.url==='/session/ses_live/message'){
      syncCalls++;
      res.setHeader('content-type','application/json');
      return res.end(JSON.stringify([{info:{id:'assistant-existing',role:'assistant',time:{completed:1}},parts:[{type:'text',text:'Cronologia'}]}]));
    }
    if(req.url?.includes('/prompt_async'))promptCalls++;
    res.writeHead(404).end('{}');
  });
  const controller=new AbortController();
  let streamPromise;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    process.env.OPENCODE_PORT=String(server.address().port);
    process.env.OPENCODE_WORKDIR=dir;
    process.env.OPENCODE_SERVER_PASSWORD='very-long-password-for-tests';
    const client=new LocalOpenCode(evt=>output.push(evt));
    client.streamRetryMs=15;
    client.sessionToChat.set('ses_live','chat-live');
    streamPromise=client.streamEvents({signal:controller.signal});
    for(let i=0;i<100&&!output.some(x=>x.type==='messages');i++)await delay(10);
    assert.equal(output.filter(e=>e.type==='event').length,1,'evento UTF-8 non deve essere perso');
    assert.equal(output.find(e=>e.type==='event')?.event?.properties?.part?.text,'Saluti 🚀');
    assert.ok(connections>=2,'riconnessione automatica');
    assert.ok(syncCalls>=1,'sincronizzazione di recupero');
    assert.ok(output.filter(e=>e.type==='messages').every(e=>e.done===false),'nessuna falsa conclusione');
    assert.equal(promptCalls,0,'non reinviare prompt durante recovery');
  }finally{
    controller.abort();
    await streamPromise?.catch(()=>{});
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
    delete process.env.OPENCODE_PORT;
    delete process.env.OPENCODE_WORKDIR;
    delete process.env.OPENCODE_SERVER_PASSWORD;
  }
});
