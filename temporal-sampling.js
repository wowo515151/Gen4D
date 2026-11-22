/** Return the highest nonzero angular frequency among waves that affect the field. */
export function highestActiveAngularFrequency(set, terms, k, parameter) {
  let highest = 0;
  for (const item of terms ?? []) {
    if (item.weight === 0) continue;
    const magnitude = Math.hypot(...item.vector);
    const frequency = set.omega(k * magnitude, parameter);
    if (Number.isFinite(frequency) && frequency > highest) highest = frequency;
  }
  return highest;
}

/** Describe temporal sampling between two successfully completed field snapshots. */
export function temporalSamplingStatus(angularFrequency, previousTime, currentTime) {
  if (!(angularFrequency > 0) || !Number.isFinite(angularFrequency) ||
      !Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return null;
  const interval = currentTime - previousTime;
  if (!(interval > 0)) return null;
  const samplesPerCycle = (2 * Math.PI) / (angularFrequency * interval);
  if (samplesPerCycle >= 4) return null;
  const sampleCount = samplesPerCycle < 0.1 ? '<0.1' : samplesPerCycle.toFixed(1);
  const alias = samplesPerCycle <= 2 ? ' At or below the temporal Nyquist limit, oscillation may be aliased.' : '';
  return `Temporal sampling warning: successful field snapshots are about ${sampleCount} per fastest active oscillation cycle.${alias} An isosurface can appear between snapshots; playback speed or rebuild latency can hide changes. The plot is a visual approximation.`;
}

/** Keep the displayed plot clock readable without hiding progress at slow speeds. */
export function formatPlotTime(time, speed) {
  if (!Number.isFinite(time)) return '—';
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const decimals = Math.max(2, Math.min(6, 2 + Math.max(0, Math.ceil(-Math.log10(safeSpeed)))));
  return time.toFixed(decimals);
}

/** Track successful field snapshots, including snapshots with no isosurface. */
export function createTemporalSampler() {
  let previousSnapshotTime = null;
  let previousWarning = null;
  return {
    reset() { previousSnapshotTime = null; previousWarning = null; },
    snapshot(angularFrequency, time) {
      if (!Number.isFinite(time)) return previousWarning;
      if (previousSnapshotTime !== null && time <= previousSnapshotTime) return previousWarning;
      previousWarning = temporalSamplingStatus(angularFrequency, previousSnapshotTime, time);
      previousSnapshotTime = time;
      return previousWarning;
    }
  };
}
