import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {subscribe, publish, disconnectUserStreams} from '../src/chat-stream.js';
class FakeResponse extends EventEmitter {
  writableEnded=false;
  writes=[];
  set() {return this;}
  flushHeaders() {}
  write(data) {if(this.writableEnded)throw new Error('Write after end');this.writes.push(data);return true;}
  end() {if(this.writableEnded)return;this.writableEnded=true;this.emit('close');}
}
const wait = ms=>new Promise(r=>setTimeout(r,ms));
test('SSE inoltra solo alla chat associata e disconnette esplicitamente utente revocato',()=>{
  const a=new FakeResponse();const b=new FakeResponse();
  subscribe('chat-a',a,{userId:'mario',authorize:async()=>true});
  subscribe('chat-b',b,{userId:'luca',authorize:async()=>true});
  publish('chat-a',{type:'private',value:'solo mario'});
  assert.ok(a.writes.join('').includes('solo mario'));
  assert.ok(!b.writes.join('').includes('solo mario'));
  disconnectUserStreams('mario');
  assert.equal(a.writableEnded,true);
  assert.equal(b.writableEnded,false);
  publish('chat-a',{type:'private',value:'non inviare'});
  assert.ok(!a.writes.join('').includes('non inviare'));
  b.end();
});
test('SSE si chiude al primo controllo quando sessione non più autorizzata',async()=>{
  const res=new FakeResponse();let auth=true;
  subscribe('chat-test',res,{userId:'utente',authorize:async()=>auth,intervalMs:8});
  await wait(12);
  assert.equal(res.writableEnded,false);
  auth=false;
  for(let i=0;i<10&&!res.writableEnded;i++)await wait(8);
  assert.equal(res.writableEnded,true);
});
test('SSE rimuove listener a chiusura volontaria',()=>{
  const res=new FakeResponse();
  subscribe('chat-close',res,{userId:'test',authorize:async()=>true});
  res.end();
  assert.doesNotThrow(()=>publish('chat-close',{type:'done'}));
});
