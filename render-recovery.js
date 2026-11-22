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

/** Invalidate in-flight animation builds on pause; retain a build if no snapshot is visible yet. */
export function pauseBuildState(revision,displayedSnapshotTime,pendingEdit=false){
  return{revision:revision+1,dirty:Boolean(pendingEdit)||!Number.isFinite(displayedSnapshotTime)};
}

/** A dirty control edit may rebuild while paused, once any previous worker job has finished. */
export function canStartBuild({dirty,workerBusy,allowed=true}){
  return Boolean(dirty&&!workerBusy&&allowed);
}
