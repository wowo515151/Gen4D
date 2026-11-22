import test from 'node:test';
import assert from 'node:assert/strict';
import {sets} from '../fields.js';
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

test('temporal sampler resets on reset and no-surface results',()=>{
  const sampler=createTemporalSampler();
  assert.equal(sampler.display(729,0.1),null);
  assert.match(sampler.display(729,0.11),/Temporal sampling warning/);
  sampler.reset();
  assert.equal(sampler.display(729,0),null,'reset starts a fresh displayed-time baseline');
  assert.equal(sampler.display(729,0.01,false),null,'a no-surface result clears the baseline');
  assert.equal(sampler.display(729,0.02),null,'the next surface after no-surface is a fresh baseline');
  assert.equal(sampler.display(0,0.03),null,'static or inactive waves do not produce a warning');
});
