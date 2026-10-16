import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicModels, validModel, isModelAvailable } from '../src/models.js';
const response={connected:['local'],all:[{id:'local',name:'Provider locale',options:{apiKey:'SECRET'},models:{'model-1':{name:'Test',secret:'NEVER'},'bad id':{name:'No'}}},{id:'paid',models:{'expensive':{name:'Private'}}}]};
test('selettore pubblica soltanto modelli dei provider connessi e nessun segreto',()=>{
  const models=publicModels(response);
  assert.deepEqual(models,[{providerID:'local',modelID:'model-1',providerName:'Provider locale',name:'Test'}]);
  assert.equal(JSON.stringify(models).includes('SECRET'),false);
  assert.equal(JSON.stringify(models).includes('NEVER'),false);
  assert.equal(isModelAvailable(models,{providerID:'local',modelID:'model-1'}),true);
  assert.equal(isModelAvailable(models,{providerID:'paid',modelID:'expensive'}),false);
});
test('identificativi arbitrari o payload malevoli vengono respinti',()=>{
  for(const model of [null,{},[],{providerID:'x',modelID:'../../secret model'},{providerID:'x',modelID:123}])assert.equal(Boolean(validModel(model)),false);
  assert.deepEqual(publicModels({all:[],connected:[]}),[]);
});
