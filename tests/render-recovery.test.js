import test from 'node:test';
import assert from 'node:assert/strict';
import {buildResultIsCurrent,canStartBuild,createRebuildGate,pauseBuildState} from '../render-recovery.js';

test('a rebuild failure stays blocked until an explicit retry request',()=>{
  const gate=createRebuildGate();
  assert.equal(gate.canAttempt(true),true);
  gate.markFailure();
  assert.equal(gate.canAttempt(true),false);
  assert.equal(gate.canAttempt(false),false);
  gate.retry();
  assert.equal(gate.canAttempt(true),true);
});

test('a worker result from an older control revision is rejected',()=>{
  assert.equal(buildResultIsCurrent(4,5),false);
  assert.equal(buildResultIsCurrent(5,5),true);
});

test('pause rejects an in-flight animation result while keeping the displayed snapshot',()=>{
  const displayed={time:4.03,geometry:'visible'};
  const requestRevision=8;
  const pause=pauseBuildState(requestRevision,displayed.time,false);
  assert.equal(pause.revision,9,'pause invalidates the in-flight worker request');
  assert.equal(buildResultIsCurrent(requestRevision,pause.revision),false,'the late result cannot replace the visible snapshot');
  assert.equal(displayed.time,4.03,'the visible sampled time remains the frozen time');
  assert.equal(pause.dirty,false,'an animation-only catch-up build is discarded when a snapshot is already visible');
  assert.equal(canStartBuild({dirty:pause.dirty,workerBusy:false}),false);
});

test('pause preserves edits made while a worker is busy and allows paused edits to rebuild',()=>{
  const gate=createRebuildGate();
  const inFlightRevision=12;
  const pause=pauseBuildState(inFlightRevision,4.03,true);
  let dirty=pause.dirty;
  assert.equal(dirty,true,'a pending user edit survives pause invalidation');
  assert.equal(buildResultIsCurrent(inFlightRevision,pause.revision),false,'the pre-pause edit result is stale');
  assert.equal(canStartBuild({dirty,workerBusy:true,allowed:gate.canAttempt(dirty)}),false,'the next edit build waits for the worker slot');
  dirty=true; // A subsequent control edit while paused calls requestBuild().
  assert.equal(canStartBuild({dirty,workerBusy:false,allowed:gate.canAttempt(dirty)}),true,'paused control edits remain eligible for rebuild');
});

test('pause before the first snapshot retains a dirty build so the view can initialize',()=>{
  const pause=pauseBuildState(2,null,false);
  assert.equal(pause.dirty,true);
  assert.equal(canStartBuild({dirty:pause.dirty,workerBusy:false}),true);
});

test('a resource-limit failure cannot trigger another automatic rebuild',()=>{
  const gate=createRebuildGate();
  gate.markFailure();
  assert.equal(gate.canAttempt(true),false);
  gate.retry();
  assert.equal(gate.canAttempt(true),true,'a user retry can re-arm the rebuild');
});
