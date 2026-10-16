import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
test('schema include separazione utenti, chat, dispositivi e token',()=>{
  for(const table of ['users','web_sessions','pairing_codes','computers','chats','messages','jobs','permission_requests'])
    assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  assert.match(schema,/user_id CHAR\(36\)/);
  assert.match(schema,/device_token_hash CHAR\(64\)/);
  assert.match(schema,/UNIQUE KEY uniq_msg_source/);
});
