import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeToolPart, updateLiveTools, updatePartialText } from './activity.js';

test('tool bash mostra comando e output senza serializzare credenziali estranee', () => {
  const part = { id: 'part1', type:'tool', tool:'bash', state:{status:'completed', input:{command:'npm test', secret:'NON MOSTRARE'},output:'test superati'}};
  const tool=summarizeToolPart(part);
  assert.equal(tool.command, 'npm test');
  assert.equal(tool.output, 'test superati');
  assert.equal(JSON.stringify(tool).includes('NON MOSTRARE'),false);
});
test('tool edit mostra il percorso e la patch e tronca le uscite grandi', () => {
  const tool=summarizeToolPart({id:'x',type:'tool',tool:'apply_patch',state:{status:'running',input:{filePath:'src/App.jsx',patch:'@@ -1 +1'},output:'x'.repeat(30000)}});
  assert.equal(tool.target,'src/App.jsx');
  assert.equal(tool.patch,'@@ -1 +1');
  assert.ok(tool.output.length<13000);
});
test('eventi tool aggiornano lo stato senza creare duplicati', () => {
  const evt=status=>({type:'message.part.updated',properties:{part:{type:'tool',id:'part-9',tool:'bash',state:{status,input:{command:'echo ok'}}}}});
  let list=updateLiveTools([],evt('running'));
  list=updateLiveTools(list,evt('completed'));
  assert.equal(list.length,1);
  assert.equal(list[0].status,'completed');
});
test('testo parziale distinto per parte e delta', () => {
  let state=updatePartialText({}, {type:'message.part.updated',properties:{part:{id:'a',type:'text',text:'ciao'}}});
  state=updatePartialText(state,{type:'message.part.delta',properties:{partID:'b',field:'text',delta:'mondo'}});
  state=updatePartialText(state,{type:'message.part.delta',properties:{partID:'b',field:'text',delta:'!'}});
  assert.deepEqual(state,{a:'ciao',b:'mondo!'});
});
