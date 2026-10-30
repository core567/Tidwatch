import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInfluenceRanges } from '../sceneOverlays.ts';
test('range overlays remain empty unless explicit, valid host ranges are supplied',()=>{
 assert.deepEqual(normalizeInfluenceRanges(undefined),[]);
 assert.deepEqual(normalizeInfluenceRanges([{id:'bad',startT:.7,endT:.2,source:'SIMULATED'},{id:'bad2',startT:NaN,endT:.4,source:'SIMULATED'},{id:'bad3',startT:0,endT:1,source:'guessed'}]),[]);
});
test('explicit range provenance and bounds survive validation without spreading to other reaches',()=>{
 const input=[{id:'r',startT:.11,endT:.19,source:'SIMULATED',label:'示意范围'}];
 assert.deepEqual(normalizeInfluenceRanges(input),input);assert.deepEqual(input,[{id:'r',startT:.11,endT:.19,source:'SIMULATED',label:'示意范围'}]);
 assert.equal(normalizeInfluenceRanges([...input,...input]).length,1);
});
