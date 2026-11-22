import test from 'node:test';
import assert from 'node:assert/strict';
import {createRebuildGate} from '../render-recovery.js';

test('a rebuild failure stays blocked until an explicit retry request',()=>{
  const gate=createRebuildGate();
  assert.equal(gate.canAttempt(true),true);
  gate.markFailure();
  assert.equal(gate.canAttempt(true),false);
  assert.equal(gate.canAttempt(false),false);
  gate.retry();
  assert.equal(gate.canAttempt(true),true);
});
