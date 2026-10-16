import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionFromEvent } from '../src/opencode.js';
test('eventi OpenCode associano la sessione a un PC',()=>{
  assert.equal(sessionFromEvent({properties:{sessionID:'s1'}}),'s1');
  assert.equal(sessionFromEvent({properties:{part:{sessionID:'s2'}}}),'s2');
  assert.equal(sessionFromEvent({properties:{info:{sessionID:'s3'}}}),'s3');
  assert.equal(sessionFromEvent({properties:{}}),null);
});
