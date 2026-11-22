import test from 'node:test';
import assert from 'node:assert/strict';
import {buildResultIsCurrent,createRebuildGate} from '../render-recovery.js';

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

test('a resource-limit failure cannot trigger another automatic rebuild',()=>{
  const gate=createRebuildGate();
  gate.markFailure();
  assert.equal(gate.canAttempt(true),false);
  gate.retry();
  assert.equal(gate.canAttempt(true),true,'a user retry can re-arm the rebuild');
});
