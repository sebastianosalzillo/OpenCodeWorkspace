import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SSEParser} from '../src/sse.js';
const utf = s=>Buffer.from(s, 'utf8');

test('SSE conserva CRLF separati fra due chunk',()=>{
  const p=new SSEParser();
  assert.deepEqual(p.push(utf('data: {"type":"session.idle"}\r')),[]);
  assert.deepEqual(p.push(utf('\n\r')),[]);
  assert.deepEqual(p.push(utf('\n')),['{"type":"session.idle"}']);
});

test('SSE conserva UTF-8 multi-byte separati a metà',()=>{
  const p=new SSEParser();
  const b=utf('data: {"text":"ciao 🚀"}\n\n');
  const pos=b.indexOf(Buffer.from('🚀')[0]);
  assert.deepEqual(p.push(b.subarray(0,pos+1)),[]);
  assert.deepEqual(p.push(b.subarray(pos+1)),['{"text":"ciao 🚀"}']);
});

test('SSE ricompone blocchi data multilinea e ignora commenti e altri campi',()=>{
  const p=new SSEParser();
  const blocks=p.push(utf(': ping\nevent: opencode\ndata: prima\ndata: seconda\n\ndata: terza\n\n'));
  assert.deepEqual(blocks,['prima\nseconda','terza']);
});

test('SSE rifiuta payload eccessivamente lunghi',()=>{
  const p=new SSEParser({maxBytes:32});
  assert.throws(()=>p.push(utf('data: '+ 'x'.repeat(40))),/troppo grande/);
  assert.deepEqual(p.push(utf('data: ok\n\n')),['ok']);
});

test('SSE supporta LF semplice e messaggi frammentati',()=>{
  const p=new SSEParser();
  assert.deepEqual(p.push(utf('data: uno\n\ndata: due\n')),['uno']);
  assert.deepEqual(p.push(utf('\n')),['due']);
});
