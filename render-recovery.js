/** Pause rebuild retries after a failure until an explicit user action requests another attempt. */
export function createRebuildGate(){
  let blocked=false;
  return {
    canAttempt(dirty){return Boolean(dirty)&&!blocked},
    markFailure(){blocked=true},
    retry(){blocked=false},
  };
}

export function buildResultIsCurrent(resultRevision,currentRevision){
  return resultRevision===currentRevision;
}
