const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalizeBaseUrl,normalizeWorkdir,validateSettings} = require('../src/settings.cjs');
const base={serverUrl:'https://workspace.example.org',workdir:'C:\\Projects\\AI',opencodePort:4096,
  name:'PC Mario',opencodePassword:'a'.repeat(32),autoStartOpenCode:true,launchAtLogin:true};
test('accetta URL https e sviluppo localhost',()=>{
  assert.equal(normalizeBaseUrl('https://workspace.example.org/'),'https://workspace.example.org');
  assert.equal(normalizeBaseUrl('http://127.0.0.1:3000'),'http://127.0.0.1:3000');
});
test('blocca server insicuri, credenziali e URL con percorso',()=>{
  for(const url of ['http://workspace.example.org','https://user:pass@workspace.example.org',
    'https://workspace.example.org/agent','https://workspace.example.org/?code=x']){
    assert.throws(()=>normalizeBaseUrl(url));
  }
});
test('directory confinata a un percorso locale non radice',()=>{
  assert.equal(normalizeWorkdir('C:/Projects/AI'),'C:\\Projects\\AI');
  for(const dir of ['.', '/tmp','\\\\server\\share','C:\\'])assert.throws(()=>normalizeWorkdir(dir));
});
test('validateSettings normalizza e protegge valori sensibili',()=>{
  const out=validateSettings(base);
  assert.equal(out.serverUrl,base.serverUrl);
  assert.equal(out.launchAtLogin,true);
  assert.throws(()=>validateSettings({...base,opencodePassword:'short'}));
  assert.throws(()=>validateSettings({...base,opencodePort:80}));
});
