import test from 'node:test';
import assert from 'node:assert/strict';
import {sets} from '../fields.js';
import {buildFieldGrid} from '../field-worker.js';
import {createTemporalSampler,formatPlotTime,highestActiveAngularFrequency,temporalSamplingStatus} from '../temporal-sampling.js';

test('highest active frequency follows the selected dispersion and ignores zero-weight waves',()=>{
  const frequency=highestActiveAngularFrequency(sets.find(set=>set.id==='quantum'),[
    {vector:[3,3,3],weight:1},
    {vector:[3,0,0],weight:0}
  ],3,3);
  assert.equal(frequency,729);
  assert.equal(highestActiveAngularFrequency(sets[0],[{vector:[3,3,3],weight:0}],3,3),0);
  assert.equal(highestActiveAngularFrequency(sets[0],[{vector:[0,0,0],weight:1}],3,3),0);
});

test('temporal status measures displayed-time intervals and identifies Nyquist cases',()=>{
  assert.equal(temporalSamplingStatus(729,null,0.1),null,'the first displayed surface has no interval yet');
  assert.match(temporalSamplingStatus(729,0,0.01),/about 0\.9 per fastest active oscillation cycle.*visual approximation/);
  assert.match(temporalSamplingStatus(729,0,0.02),/Nyquist limit.*aliased/);
  assert.match(temporalSamplingStatus(729,0,1),/about <0\.1 per fastest active oscillation cycle/,'very low sample counts should not round down to zero');
  assert.equal(temporalSamplingStatus(1,0,1),null,'six samples per cycle do not trigger the heuristic');
  assert.equal(temporalSamplingStatus(0,0,1),null,'a zero-frequency field does not warn');
  assert.equal(temporalSamplingStatus(2,1,0),null,'a backwards reset is not treated as a long interval');
});

test('slow playback can reach four samples per fastest cycle at a representative update interval',()=>{
  const frequency=729,updateInterval=0.18;
  const slowSamples=2*Math.PI/(frequency*updateInterval*0.001);
  const quarterSpeedSamples=2*Math.PI/(frequency*updateInterval*0.25);
  assert.ok(slowSamples>=4,`${slowSamples.toFixed(1)} displayed surfaces per cycle at 0.001×`);
  assert.ok(quarterSpeedSamples<4,`${quarterSpeedSamples.toFixed(1)} samples per cycle at 0.25×`);
});

test('plot time uses enough decimals to show progress at slow playback speeds',()=>{
  assert.equal(formatPlotTime(1.00018,1),'1.00');
  assert.equal(formatPlotTime(1.00018,0.001),'1.00018');
  assert.equal(formatPlotTime(Number.NaN,0.001),'—');
});

test('equal, regressive, and invalid snapshot times do not move the temporal baseline',()=>{
  const sampler=createTemporalSampler();
  assert.equal(sampler.snapshot(729,1),null);
  const warning=sampler.snapshot(729,1.01);
  assert.match(warning,/Temporal sampling warning/);
  assert.equal(sampler.snapshot(729,1.01),warning,'an equal-time build keeps the current warning without changing the baseline');
  assert.equal(sampler.snapshot(729,0.5),warning,'a regressive result neither replaces the baseline nor hides the warning');
  assert.equal(sampler.snapshot(729,Number.NaN),warning,'an invalid timestamp does not hide an existing warning');
  assert.match(sampler.snapshot(729,1.02),/Temporal sampling warning/,'the next later snapshot is compared with the last accepted timestamp');
  sampler.reset();
  assert.equal(sampler.snapshot(729,0),null,'reset clears both baseline and warning');
});

test('two successful no-surface Klein–Gordon snapshots still reveal an intermediate crossing',()=>{
  const request={setId:'relativity',equationIndex:0,params:{amplitude:1,k:0.1,phase:0,parameter:3,terms:[{vector:[1,0,0],weight:1,phase:0}]},n:13,levels:[0],tubular:false,revision:1};
  const first=buildFieldGrid({...request,time:0});
  const second=buildFieldGrid({...request,time:0.72});
  const between=buildFieldGrid({...request,time:0.52});
  assert.equal(first.levels.length,0,'the initial snapshot has no zero-level surface');
  assert.equal(second.levels.length,0,'the later snapshot also has no zero-level surface');
  assert.equal(between.levels.length,1,'an isosurface crosses between those snapshots');
  const frequency=highestActiveAngularFrequency(sets.find(set=>set.id==='relativity'),request.params.terms,request.params.k,request.params.parameter);
  const sampler=createTemporalSampler();
  assert.equal(sampler.snapshot(frequency,first.time),null);
  assert.match(sampler.snapshot(frequency,second.time),/successful field snapshots are about 2\.9 per fastest active oscillation cycle.*isosurface can appear between snapshots/);
});

test('temporal sampler includes empty-to-visible snapshots and resets on pause, reset, edits, and errors',()=>{
  const sampler=createTemporalSampler();
  assert.equal(sampler.snapshot(729,0.1),null);
  assert.match(sampler.snapshot(729,0.11),/Temporal sampling warning/);
  sampler.reset();
  assert.equal(sampler.snapshot(729,0),null,'an empty snapshot starts the interval');
  assert.match(sampler.snapshot(729,0.01),/Temporal sampling warning/,'a later visible snapshot uses the preceding empty snapshot');
  sampler.reset();
  assert.equal(sampler.snapshot(729,0),null,'reset or pause starts a fresh snapshot baseline');
  sampler.reset();
  assert.equal(sampler.snapshot(729,0.01),null,'an edit starts a fresh snapshot baseline');
  sampler.reset();
  assert.equal(sampler.snapshot(729,0.02),null,'an error discards the prior baseline');
  assert.match(sampler.snapshot(729,0.03),/Temporal sampling warning/,'sampling resumes after a new successful snapshot');
  assert.equal(sampler.snapshot(0,0.04),null,'static or inactive waves do not produce a warning');
  sampler.reset();
  assert.equal(sampler.snapshot(0,0),null,'a zero-frequency snapshot still establishes the time baseline');
  assert.match(sampler.snapshot(729,0.01),/Temporal sampling warning/,'a later active field uses the actual snapshot interval');
});
