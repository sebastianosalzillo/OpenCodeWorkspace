import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchingReply} from '../src/recovery.js';

const msgs=[
  {info:{id:'u-old',role:'user',time:{created:1000}},parts:[{type:'text',text:'Uguale'}]},
  {info:{id:'a-old',role:'assistant',parentID:'u-old',time:{completed:1200}},parts:[{type:'text',text:'Prima'}]},
  {info:{id:'u-new',role:'user',time:{created:500000}},parts:[{type:'text',text:'Uguale'}]},
  {info:{id:'a-new',role:'assistant',parentID:'u-new',time:{completed:501000}},parts:[{type:'text',text:'Dopo'}]}
];
test('recovery: identifica la risposta dell ultimo prompt identico e non quella vecchia',()=>{
  assert.equal(matchingReply(msgs,{text:'Uguale',after:500000})?.info.id,'a-new');
  assert.equal(matchingReply(msgs.slice(0,2),{text:'Uguale',after:500000}),null);
  assert.equal(matchingReply(msgs,{text:'Non consegnato',after:500000}),null);
});
test('recovery: non confonde un assistant vecchio con il job ancora pendente',()=>{
  assert.equal(matchingReply(msgs.slice(0,3),{text:'Uguale',after:500000}),null);
  assert.equal(matchingReply(msgs,{text:'Uguale',baseline:new Set(['a-new'])}),null);
  const wrong=[msgs[0],msgs[1],msgs[2],{...msgs[3],info:{...msgs[3].info,parentID:'u-old'}}];
  assert.equal(matchingReply(wrong,{text:'Uguale'}),null);
});
test('recovery: fallisce in modo sicuro con input non verificabile',()=>{
  assert.equal(matchingReply([], {text:'x'}),null);
  assert.equal(matchingReply(msgs, {text:''}),null);
  assert.equal(matchingReply(null, {text:'x'}),null);
});
