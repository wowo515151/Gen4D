/** Track elapsed visible playback time without accumulating paused or hidden time. */
export function createSimulationClock({now=0,time=0,playing=true,speed=1,visible=true}={}){
  let previous=now,simulationTime=time,isPlaying=playing,playbackSpeed=speed,isVisible=visible;
  function advance(now){
    const monotonicNow=Math.max(now,previous);
    const elapsed=(monotonicNow-previous)/1000;
    if(isPlaying&&isVisible)simulationTime+=elapsed*playbackSpeed;
    previous=monotonicNow;
    return simulationTime;
  }
  return{
    tick:advance,
    setPlaying(value,now){advance(now);isPlaying=Boolean(value);return simulationTime},
    pauseAt(value,now){advance(now);isPlaying=false;if(Number.isFinite(value))simulationTime=value;return simulationTime},
    setSpeed(value,now){advance(now);playbackSpeed=Number(value);return simulationTime},
    setVisible(value,now){advance(now);isVisible=Boolean(value);return simulationTime},
    reset(now){previous=Math.max(now,previous);simulationTime=0;return simulationTime},
    get time(){return simulationTime}
  };
}
