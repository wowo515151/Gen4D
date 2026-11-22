import {createWireframe} from './lib/three-viz/plotters/shared/wireframe.js';
import {retainCarPaintEnvironment} from './lib/three-viz/plotters/shared/materials.js';
import {sets,equations,formatEquation,formatFieldSummary,numericInputValue,samplingWarning} from './fields.js';
import {buildFieldGrid,TUBE_EDGE_BUDGET} from './field-worker.js';
import {LEVEL_COLORS,levelColor} from './level-colors.js';
import {createRebuildGate,buildResultIsCurrent,pauseBuildState,canStartBuild,blockUnavailableBuild} from './render-recovery.js';
import {createTemporalSampler,formatPlotTime,highestActiveAngularFrequency} from './temporal-sampling.js';
import {createSimulationClock} from './simulation-clock.js';

const $=id=>document.getElementById(id), THREE=window.THREE;
const ui={set:$('set'),equation:$('equation'),mode:$('mode'),resolution:$('resolution'),levels:$('levels'),level:$('level'),speed:$('playback-speed'),status:$('status')};
let set=sets[0], equation=equations[5], params={amplitude:1,k:1.2,phase:0,parameter:1}, time=0, displayedSnapshotTime=null, playing=true, dirty=true, pendingEdit=true, lastBuild=0, editRevision=0;
const rebuildGate=createRebuildGate();
const temporalSampler=createTemporalSampler();
const simulationClock=createSimulationClock({now:performance.now(),time,playing,speed:Number(ui.speed.value),visible:document.visibilityState==='visible'});
function resetTemporalSampling(){temporalSampler.reset();$('temporal-warning').hidden=true;$('temporal-warning').textContent=''}
function requestBuild(){editRevision++;dirty=true;pendingEdit=true;resetTemporalSampling()}
for(const item of sets) ui.set.add(new Option(item.name,item.id));
for(const [index,item] of equations.entries()) ui.equation.add(new Option(item.name,String(index)));
ui.equation.value='5';
const parameters=[['amplitude','Amplitude A',1,0.1,3,0.1],['k','Wave number k',1.2,0.1,3,0.1],['phase','Phase φ',0,-6.28,6.28,0.1],['parameter','',1,0.1,3,0.1]];
function defaultTerms(item){return item.terms.map(({vector})=>({vector:[...vector],weight:1,phase:0}))}
params.terms=defaultTerms(equation);
function parameterControls(){
  $('parameters').replaceChildren();
  for(const [key,label,initial,min,max,step] of parameters){const wrap=document.createElement('div');wrap.className='param';const name=document.createElement('label');name.htmlFor=`param-${key}`;name.textContent=key==='parameter'?set.parameterLabel:label;const input=document.createElement('input');input.id=name.htmlFor;input.type='number';input.min=min;input.max=max;input.step=step;input.value=params[key];input.addEventListener('change',()=>{params[key]=numericInputValue(input.valueAsNumber,min,max,params[key]??initial);input.value=params[key];rebuildGate.retry();updateAccessibleSummary();updateSamplingWarning();requestBuild()});wrap.append(name,input);$('parameters').append(wrap)}
}
function termControls(){
  const container=$('term-controls');container.replaceChildren();
  params.terms.forEach((term,index)=>{
    const details=document.createElement('details');details.className='term-control';
    const summary=document.createElement('summary');summary.textContent=`Wave component ${index+1}`;details.append(summary);
    const fields=[['x','x component',-3,3,0.1],['y','y component',-3,3,0.1],['z','z component',-3,3,0.1],['weight','Relative amplitude',0,3,0.1],['phase','Phase offset (rad)',-6.28,6.28,0.1]];
    for(const [key,label,min,max,step] of fields){
      const id=`term-${index}-${key}`,wrap=document.createElement('div');wrap.className='param';
      const name=document.createElement('label');name.htmlFor=id;name.textContent=label;
      const input=document.createElement('input');input.id=id;input.type='number';input.min=min;input.max=max;input.step=step;input.value=key==='x'||key==='y'||key==='z'?term.vector['xyz'.indexOf(key)]:term[key];
      input.addEventListener('change',()=>{const current=key==='x'||key==='y'||key==='z'?term.vector['xyz'.indexOf(key)]:term[key],next=numericInputValue(input.valueAsNumber,min,max,current);input.value=next;if(key==='x'||key==='y'||key==='z')term.vector['xyz'.indexOf(key)]=next;else term[key]=next;rebuildGate.retry();updateEquationReadout();updateSamplingWarning();requestBuild()});
      wrap.append(name,input);details.append(wrap);
    }
    container.append(details);
  });
}
function updateAccessibleSummary(){$('field-accessible-summary').textContent=formatFieldSummary(set,equation,params)}
function updateSamplingWarning(){
  const n=Number(ui.resolution.value),spacing=6/(n-1),warning=$('sampling-warning'),message=samplingWarning(params.terms,params.k,spacing,n);
  $('resolution-value').textContent=`${n}³ · ${(n**3).toLocaleString()} samples`;
  warning.hidden=message===null;
  if(message!==null)warning.textContent=message;
}
function updateEquationReadout(){$('formula').textContent=formatEquation(set,equation,params.terms);$('field-name').textContent=`${set.name} / ${equation.name}`;$('pde').textContent=set.pde;updateAccessibleSummary()}
function updateLabels(){updateEquationReadout();$('description').textContent=set.description;parameterControls();termControls();updateSamplingWarning();rebuildGate.retry();requestBuild()}
ui.set.addEventListener('change',()=>{set=sets.find(item=>item.id===ui.set.value);params.parameter=set.parameterValue;updateLabels()});ui.equation.addEventListener('change',()=>{equation=equations[Number(ui.equation.value)];params.terms=defaultTerms(equation);updateLabels()});
function selectedLevels(){const count=Number(ui.levels.value);return count===1?[Number(ui.level.value)]:Array.from({length:count},(_,i)=>-0.75+1.5*(i+1)/(count+1))}
function updateDisplay(){
  $('levels-value').textContent=ui.levels.value;$('level-value').textContent=ui.level.value;
  ui.level.disabled=Number(ui.levels.value)>1;
  const legend=$('legend');legend.replaceChildren();
  selectedLevels().forEach((level,index)=>{const item=document.createElement('span'),swatch=document.createElement('i');swatch.style.backgroundColor=`#${levelColor(index).toString(16).padStart(6,'0')}`;swatch.setAttribute('aria-hidden','true');item.append(swatch,document.createTextNode(`${Number(level.toFixed(3))} A`));legend.append(item)});
  updateSamplingWarning();rebuildGate.retry();requestBuild();
}
ui.resolution.addEventListener('change',()=>{updateSamplingWarning();rebuildGate.retry();requestBuild()});for(const control of [ui.mode,ui.levels,ui.level]) control.addEventListener('input',updateDisplay);
$('play').addEventListener('click',()=>{const now=performance.now();playing=!playing;if(playing){time=simulationClock.setPlaying(true,now);rebuildGate.retry();requestBuild()}else{time=simulationClock.pauseAt(displayedSnapshotTime,now);const pausedBuild=pauseBuildState(editRevision,displayedSnapshotTime,pendingEdit);editRevision=pausedBuild.revision;dirty=pausedBuild.dirty;resetTemporalSampling()}$('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'Pause animation':'Play animation');$('play').setAttribute('aria-pressed',String(playing))});ui.speed.addEventListener('change',()=>{time=simulationClock.setSpeed(Number(ui.speed.value),performance.now());resetTemporalSampling()});$('reset').addEventListener('click',()=>{time=simulationClock.reset(performance.now());displayedSnapshotTime=null;$('time').textContent='—';rebuildGate.retry();requestBuild()});
function pauseAfterFailure(now=performance.now()){playing=false;time=simulationClock.setPlaying(false,now);$('play').textContent='▶';$('play').setAttribute('aria-label','Play animation');$('play').setAttribute('aria-pressed','false')}
updateLabels();updateDisplay();
try {
  const viewport=$('viewport'),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,0.1,100);camera.position.set(7,5,8);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputEncoding=THREE.sRGBEncoding;viewport.append(renderer.domElement);
  const controls=new THREE.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=4;controls.maxDistance=25;
  viewport.addEventListener('keydown',event=>{const offset=new THREE.Vector3().subVectors(camera.position,controls.target),spherical=new THREE.Spherical().setFromVector3(offset),turn=0.12;switch(event.key){case'ArrowLeft':spherical.theta+=turn;break;case'ArrowRight':spherical.theta-=turn;break;case'ArrowUp':spherical.phi=Math.max(0.12,spherical.phi-turn);break;case'ArrowDown':spherical.phi=Math.min(Math.PI-0.12,spherical.phi+turn);break;case'+':case'=':spherical.radius=Math.max(controls.minDistance,spherical.radius/1.1);break;case'-':case'_':spherical.radius=Math.min(controls.maxDistance,spherical.radius*1.1);break;default:return}camera.position.setFromSpherical(spherical).add(controls.target);camera.lookAt(controls.target);controls.update();event.preventDefault()});
  scene.add(new THREE.HemisphereLight(0xb8ecff,0x172333,0.9));const light=new THREE.DirectionalLight(0xffffff,1.5);light.position.set(3,6,5);scene.add(light);retainCarPaintEnvironment(THREE,scene,renderer);
  const box=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(6,6,6)),new THREE.LineBasicMaterial({color:0x45687b,transparent:true,opacity:0.45}));scene.add(box);
  const group=new THREE.Group();scene.add(group);let worker=null,workerBusy=false,workerUnavailable=false;
  function clear(){while(group.children.length){const object=group.children[0];group.remove(object);object.geometry.dispose();object.material.dispose()}}
  function startWorker(){if(typeof Worker!=='function'){workerUnavailable=true;return}try{worker=new Worker(new URL('./field-worker.js',import.meta.url),{type:'module'});workerUnavailable=false;worker.addEventListener('message',event=>{
    workerBusy=false;const result=event.data;if(!buildResultIsCurrent(result.revision,editRevision))return;
    if(result.limitExceeded){clear();displayedSnapshotTime=null;pendingEdit=false;$('time').textContent='—';resetTemporalSampling();dirty=false;rebuildGate.markFailure();pauseAfterFailure();ui.status.textContent=`DETAIL LIMIT · at least ${result.edgeCount.toLocaleString()} tube edges exceed the ${TUBE_EDGE_BUDGET.toLocaleString()}-edge rebuild budget; animation paused. Lower grid detail or levels`;return}
    if(result.error){clear();displayedSnapshotTime=null;pendingEdit=false;$('time').textContent='—';resetTemporalSampling();ui.status.textContent=`FIELD BUILD ERROR · ${result.error}`;rebuildGate.markFailure();pauseAfterFailure();return}
    try{showBuild(result)}catch(error){clear();displayedSnapshotTime=null;pendingEdit=false;$('time').textContent='—';resetTemporalSampling();ui.status.textContent=`RENDER ERROR: ${error.message}`;rebuildGate.markFailure();pauseAfterFailure()}
  });worker.addEventListener('error',()=>{worker.terminate();worker=null;workerBusy=false;workerUnavailable=true;resetTemporalSampling();ui.status.textContent='BACKGROUND BUILDER UNAVAILABLE · choose at most 19 grid points';dirty=true})}catch{worker=null;workerUnavailable=true}}
  startWorker();document.addEventListener('visibilitychange',()=>{time=simulationClock.setVisible(document.visibilityState==='visible',performance.now())});addEventListener('pagehide',()=>{time=simulationClock.setVisible(false,performance.now());worker?.terminate();worker=null;workerBusy=false},{once:false});addEventListener('pageshow',()=>{time=simulationClock.setVisible(document.visibilityState==='visible',performance.now());if(!worker){startWorker();rebuildGate.retry();requestBuild()}},{once:false});
  function showBuild(result){
    const tubular=ui.mode.value==='tube';
    const pending=[];try{for(const item of result.levels){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(item.positions,3));geometry.computeVertexNormals();const color=levelColor(item.levelIndex);
      if(ui.mode.value==='surface'){const material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,metalness:0.12,roughness:0.34,emissive:color,emissiveIntensity:0.12});pending.push({object:new THREE.Mesh(geometry,material),geometry,material})}
      else{try{const wire=createWireframe(THREE,geometry,{color,full:true,tubeRadius:tubular?0.012:0,tubeSegments:item.segments});geometry.dispose();pending.push(wire)}catch(error){geometry.dispose();throw error}}
    }}catch(error){for(const item of pending){item.object.geometry.dispose();if(Array.isArray(item.object.material))item.object.material.forEach(material=>material.dispose());else item.object.material.dispose()}throw error}
    clear();pending.forEach(item=>group.add(item.object));const rendered=pending.length;pendingEdit=false;
    const sampleTime=result.time;
    if(Number.isFinite(sampleTime)){
      displayedSnapshotTime=sampleTime;
      $('time').textContent=formatPlotTime(sampleTime,Number(ui.speed.value));
      const frequency=highestActiveAngularFrequency(set,params.terms,params.k,params.parameter);
      const message=temporalSampler.snapshot(frequency,sampleTime);
      const warning=$('temporal-warning');warning.textContent=message??'';warning.hidden=message===null;
    }else{displayedSnapshotTime=null;$('time').textContent='—';resetTemporalSampling()}
    if(!rendered){ui.status.textContent='NO SURFACE AT THIS LEVEL · FIELD SNAPSHOT UPDATED';return}
    ui.status.textContent=`${rendered} LEVEL${rendered===1?'':'S'} VISIBLE · GRID ${Number(ui.resolution.value)}³`;
  }
  function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};new ResizeObserver(resize).observe(viewport);resize();
  function buildRequest(){return{setId:set.id,equationIndex:equations.indexOf(equation),params:JSON.parse(JSON.stringify(params)),time,n:Number(ui.resolution.value),levels:selectedLevels(),tubular:ui.mode.value==='tube',revision:editRevision}}
  let lastRequestedRevision=-1;function frame(now){requestAnimationFrame(frame);time=simulationClock.tick(now);if(playing&&document.visibilityState==='visible'&&rebuildGate.canAttempt(true))dirty=true;if(canStartBuild({dirty,workerBusy,allowed:rebuildGate.canAttempt(dirty)})&&now-lastBuild>180){const request=buildRequest();try{if(request.revision!==lastRequestedRevision){ui.status.textContent=`BUILDING ${request.n}³ FIELD GRID`;lastRequestedRevision=request.revision}if(worker){workerBusy=true;dirty=false;worker.postMessage(request)}else if(Number(ui.resolution.value)<=19){dirty=false;showBuild(buildFieldGrid(request))}else{clear();displayedSnapshotTime=null;pendingEdit=false;$('time').textContent='—';resetTemporalSampling();dirty=false;ui.status.textContent=workerUnavailable?'BACKGROUND BUILDER UNAVAILABLE · choose at most 19 grid points':'WORKERS UNAVAILABLE · choose at most 19 grid points';if(blockUnavailableBuild(rebuildGate,ui.resolution.value))pauseAfterFailure(now)}}catch(error){workerBusy=false;ui.status.textContent=`RENDER ERROR: ${error.message}`;dirty=false;pendingEdit=false;rebuildGate.markFailure();pauseAfterFailure(now);resetTemporalSampling();displayedSnapshotTime=null;$('time').textContent='—'}lastBuild=now}controls.update();renderer.render(scene,camera)}requestAnimationFrame(frame);
}catch(error){ui.status.textContent=`GRAPHICS UNAVAILABLE: ${error.message}`}
