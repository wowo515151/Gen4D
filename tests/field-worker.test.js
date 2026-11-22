import test from 'node:test';
import assert from 'node:assert/strict';
import {equations} from '../fields.js';
import {buildFieldGrid,TUBE_EDGE_BUDGET} from '../field-worker.js';
import {levelColor} from '../level-colors.js';

const settings=(equationIndex,k=3)=>({setId:'em',equationIndex,params:{amplitude:1,k,phase:0,parameter:1,terms:equations[equationIndex].terms.map(({vector})=>({vector,weight:1,phase:0}))},time:0,levels:[0],tubular:false,revision:1});

test('selected grid resolution controls geometry density through the allowed 37-point maximum',()=>{
  const coarse=buildFieldGrid({...settings(0),n:13}),fine=buildFieldGrid({...settings(0),n:37});
  assert.equal(fine.time,0,'worker results retain the sampled simulation time');
  assert.ok(fine.levels[0].positions.length>coarse.levels[0].positions.length);
  assert.equal(fine.levels[0].segments.length,0);
});

test('worker results retain time when the requested isosurface is absent',()=>{
  const result=buildFieldGrid({...settings(0),time:1.25,n:13,levels:[2]});
  assert.equal(result.time,1.25);
  assert.deepEqual(result.levels,[]);
});

test('skipped earlier and middle levels retain their requested identity and color',()=>{
  const requested=[2,0,-2,.5];
  const result=buildFieldGrid({...settings(0),n:13,levels:requested});
  assert.deepEqual(result.levels.map(({levelIndex,level})=>({levelIndex,level})),[
    {levelIndex:1,level:0},
    {levelIndex:3,level:.5}
  ]);
  assert.deepEqual(result.levels.map(item=>levelColor(item.levelIndex)),[levelColor(1),levelColor(3)]);
  assert.notEqual(levelColor(1),levelColor(0),'the first surviving surface keeps the second legend color');
  assert.notEqual(levelColor(3),levelColor(1),'the later surface keeps its fourth legend color');
});

test('four-level EM traveling wave keeps the fourth legend color when only the last level crosses',()=>{
  const result=buildFieldGrid({...settings(0,.4),n:13,levels:[-.45,-.15,.15,.45]});
  assert.deepEqual(result.levels.map(({levelIndex,level})=>({levelIndex,level})),[
    {levelIndex:3,level:.45}
  ]);
  assert.equal(levelColor(result.levels[0].levelIndex),levelColor(3));
  assert.notEqual(levelColor(result.levels[0].levelIndex),levelColor(0),'the surviving surface matches the fourth legend swatch');
});

test('four-level default pattern remains inside the tube budget at 19 points',()=>{
  const request={...settings(5,1.2),n:19,levels:[-.45,-.15,.15,.45],tubular:true};
  const result=buildFieldGrid(request),edges=result.levels.reduce((sum,item)=>sum+item.segments.length/6,0);
  assert.ok(edges>0&&edges<=TUBE_EDGE_BUDGET,`${edges} unique tube edges`);
});

test('high-frequency four-level weave stops and discards geometry when the tube budget is exceeded',()=>{
  const request={...settings(9,3),n:19,levels:[-.45,-.15,.15,.45],tubular:true};
  const result=buildFieldGrid(request);
  assert.equal(result.limitExceeded,true);
  assert.ok(result.edgeCount>TUBE_EDGE_BUDGET,`${result.edgeCount} unique tube edges should exceed ${TUBE_EDGE_BUDGET}`);
  assert.equal(result.edgeCount,TUBE_EDGE_BUDGET+1,'segment collection stops immediately after the first over-budget edge');
  assert.deepEqual(result.levels,[],'over-budget jobs discard extracted buffers before transfer');
});
