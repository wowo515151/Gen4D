import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulationClock} from '../simulation-clock.js';

test('visible playback counts full elapsed time across long frame gaps',()=>{
  const clock=createSimulationClock({now:0});
  assert.equal(clock.tick(5000),5,'a long visible frame gap must not be capped');
  assert.equal(clock.tick(10000),10);
});

test('pause stops the clock immediately and resume starts from its transition time',()=>{
  const clock=createSimulationClock({now:0});
  assert.equal(clock.setPlaying(false,2500),2.5,'pausing accounts for visible playback before the click');
  assert.equal(clock.tick(9000),2.5,'paused time is excluded');
  assert.equal(clock.setPlaying(true,10000),2.5);
  assert.equal(clock.tick(11000),3.5,'resumed playback starts at its own transition');
});

test('hidden and pagehide intervals are excluded after visibility restoration',()=>{
  const clock=createSimulationClock({now:0});
  assert.equal(clock.setVisible(false,2000),2,'time up to the hide transition is counted');
  assert.equal(clock.tick(602000),2,'hidden time is excluded even with a long callback gap');
  assert.equal(clock.setVisible(true,602000),2,'pageshow or visibility restoration resets the baseline');
  assert.equal(clock.tick(603500),3.5,'only visible resumed time is added');
});

test('speed changes and reset use deterministic transition timestamps',()=>{
  const clock=createSimulationClock({now:0});
  assert.equal(clock.setSpeed(2,1000),1);
  assert.equal(clock.tick(2000),3);
  assert.equal(clock.reset(2500),0);
  assert.equal(clock.tick(3000),1,'reset uses a fresh time baseline and retains the selected speed');
});

test('a delayed RAF timestamp after a control event cannot rewind the baseline',()=>{
  const clock=createSimulationClock({now:1000});
  assert.equal(clock.tick(1000),0);
  assert.equal(clock.setPlaying(false,1005),0.005);
  assert.equal(clock.tick(1004),0.005,'an older callback timestamp does not move the baseline backward');
  assert.equal(clock.setPlaying(true,1006),0.005);
  assert.equal(clock.tick(1011),0.010,'the next valid frame is counted once');
});

test('reset cannot rewind the baseline when its timestamp is older',()=>{
  const clock=createSimulationClock({now:0});
  assert.equal(clock.tick(100),0.1);
  assert.equal(clock.reset(90),0);
  assert.equal(clock.tick(110),0.01,'only time after the reset baseline is counted');
});
