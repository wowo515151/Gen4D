import {extractIsosurface} from './lib/three-viz/plotters/shared/isosurface.js';
import {createWireframe} from './lib/three-viz/plotters/shared/wireframe.js';
import {retainCarPaintEnvironment} from './lib/three-viz/plotters/shared/materials.js';
import {sets,equations,sample,formatEquation,formatFieldSummary,clampFinite} from './fields.js';
import {createRebuildGate} from './render-recovery.js';

const $=id=>document.getElementById(id), THREE=window.THREE;
const ui={set:$('set'),equation:$('equation'),mode:$('mode'),levels:$('levels'),level:$('level'),status:$('status')};
let set=sets[0], equation=equations[5], params={amplitude:1,k:1.2,phase:0,parameter:1}, time=0, playing=true, dirty=true, lastBuild=0;
const rebuildGate=createRebuildGate();
for(const item of sets) ui.set.add(new Option(item.name,item.id));
for(const [index,item] of equations.entries()) ui.equation.add(new Option(item.name,String(index)));
ui.equation.value='5';
const parameters=[['amplitude','Amplitude A',1,0.1,3,0.1],['k','Wave number k',1.2,0.1,3,0.1],['phase','Phase φ',0,-6.28,6.28,0.1],['parameter','',1,0.1,3,0.1]];
function defaultTerms(item){return item.terms.map(({vector})=>({vector:[...vector],weight:1,phase:0}))}
params.terms=defaultTerms(equation);
function parameterControls(){
  $('parameters').replaceChildren();
  for(const [key,label,initial,min,max,step] of parameters){const wrap=document.createElement('div');wrap.className='param';const name=document.createElement('label');name.htmlFor=`param-${key}`;name.textContent=key==='parameter'?set.parameterLabel:label;const input=document.createElement('input');input.id=name.htmlFor;input.type='number';input.min=min;input.max=max;input.step=step;input.value=params[key];input.addEventListener('change',()=>{params[key]=clampFinite(Number(input.value),min,max,initial);input.value=params[key];rebuildGate.retry();updateAccessibleSummary();dirty=true});wrap.append(name,input);$('parameters').append(wrap)}
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
      input.addEventListener('change',()=>{const next=clampFinite(Number(input.value),min,max,0);input.value=next;if(key==='x'||key==='y'||key==='z')term.vector['xyz'.indexOf(key)]=next;else term[key]=next;rebuildGate.retry();updateEquationReadout();dirty=true});
      wrap.append(name,input);details.append(wrap);
    }
    container.append(details);
  });
}
function updateAccessibleSummary(){$('field-accessible-summary').textContent=formatFieldSummary(set,equation,params)}
function updateEquationReadout(){$('formula').textContent=formatEquation(set,equation,params.terms);$('field-name').textContent=`${set.name} / ${equation.name}`;$('pde').textContent=set.pde;updateAccessibleSummary()}
function updateLabels(){updateEquationReadout();$('description').textContent=set.description;parameterControls();termControls();rebuildGate.retry();dirty=true}
ui.set.addEventListener('change',()=>{set=sets.find(item=>item.id===ui.set.value);params.parameter=set.parameterValue;updateLabels()});ui.equation.addEventListener('change',()=>{equation=equations[Number(ui.equation.value)];params.terms=defaultTerms(equation);updateLabels()});
const colors=[0x55c9e6,0x82e5c6,0xeaa5b2,0xd4b5ff];
function selectedLevels(){const count=Number(ui.levels.value);return count===1?[Number(ui.level.value)]:Array.from({length:count},(_,i)=>-0.75+1.5*(i+1)/(count+1))}
function updateDisplay(){
  $('levels-value').textContent=ui.levels.value;$('level-value').textContent=ui.level.value;
  ui.level.disabled=Number(ui.levels.value)>1;
  const legend=$('legend');legend.replaceChildren();
  selectedLevels().forEach((level,index)=>{const item=document.createElement('span'),swatch=document.createElement('i');swatch.style.backgroundColor=`#${colors[index].toString(16).padStart(6,'0')}`;swatch.setAttribute('aria-hidden','true');item.append(swatch,document.createTextNode(`${Number(level.toFixed(3))} A`));legend.append(item)});
  rebuildGate.retry();dirty=true;
}
for(const control of [ui.mode,ui.levels,ui.level]) control.addEventListener('input',updateDisplay);
$('play').addEventListener('click',()=>{playing=!playing;if(playing){rebuildGate.retry();dirty=true}$('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'Pause animation':'Play animation');$('play').setAttribute('aria-pressed',String(playing))});$('reset').addEventListener('click',()=>{time=0;rebuildGate.retry();dirty=true});
updateLabels();updateDisplay();
try {
  const viewport=$('viewport'),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,0.1,100);camera.position.set(7,5,8);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputEncoding=THREE.sRGBEncoding;viewport.append(renderer.domElement);
  const controls=new THREE.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=4;controls.maxDistance=25;
  viewport.addEventListener('keydown',event=>{const offset=new THREE.Vector3().subVectors(camera.position,controls.target),spherical=new THREE.Spherical().setFromVector3(offset),turn=0.12;switch(event.key){case'ArrowLeft':spherical.theta+=turn;break;case'ArrowRight':spherical.theta-=turn;break;case'ArrowUp':spherical.phi=Math.max(0.12,spherical.phi-turn);break;case'ArrowDown':spherical.phi=Math.min(Math.PI-0.12,spherical.phi+turn);break;case'+':case'=':spherical.radius=Math.max(controls.minDistance,spherical.radius/1.1);break;case'-':case'_':spherical.radius=Math.min(controls.maxDistance,spherical.radius*1.1);break;default:return}camera.position.setFromSpherical(spherical).add(controls.target);camera.lookAt(controls.target);controls.update();event.preventDefault()});
  scene.add(new THREE.HemisphereLight(0xb8ecff,0x172333,0.9));const light=new THREE.DirectionalLight(0xffffff,1.5);light.position.set(3,6,5);scene.add(light);retainCarPaintEnvironment(THREE,scene,renderer);
  const box=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(6,6,6)),new THREE.LineBasicMaterial({color:0x45687b,transparent:true,opacity:0.45}));scene.add(box);
  const group=new THREE.Group();scene.add(group);
  function clear(){while(group.children.length){const object=group.children[0];group.remove(object);object.geometry.dispose();object.material.dispose()}}
  function sampleAxis(){const compact=matchMedia('(max-width: 760px)').matches,complex=ui.mode.value==='tube'&&Number(ui.levels.value)>=3,n=complex?(compact?13:15):(compact?17:19);return Array.from({length:n},(_,i)=>-3+6*i/(n-1))}
  function rebuild(){
    clear();const axis=sampleAxis(),cells=axis.map(x=>axis.map(y=>axis.map(z=>({value:sample(set,equation,params,x,y,z,time),row:null}))));const grid={axes:[axis,axis,axis],cells,world:(a,i)=>a[i]};const levels=selectedLevels();let rendered=0;
    for(const [i,level] of levels.entries())try{const surface=extractIsosurface(grid,level*params.amplitude),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(surface.positions,3));geometry.computeVertexNormals();const color=colors[i%colors.length];if(ui.mode.value==='surface'){const material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,metalness:0.12,roughness:0.34,emissive:color,emissiveIntensity:0.12});group.add(new THREE.Mesh(geometry,material))}else{const wire=createWireframe(THREE,geometry,{color,full:true,tubeRadius:ui.mode.value==='tube'?0.012:0});geometry.dispose();group.add(wire.object)}rendered++}catch(error){if(!String(error.message).startsWith('No scalar grid surface'))throw error}
    ui.status.textContent=rendered?`${rendered} LEVEL${rendered===1?'':'S'} VISIBLE`:'NO SURFACE AT THIS LEVEL';dirty=false;
  }
  function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};new ResizeObserver(resize).observe(viewport);resize();
  let previous=performance.now();function frame(now){requestAnimationFrame(frame);const delta=Math.min((now-previous)/1000,.1);previous=now;if(playing){time+=delta;if(rebuildGate.canAttempt(true))dirty=true}$('time').textContent=time.toFixed(2);if(rebuildGate.canAttempt(dirty)&&now-lastBuild>180){try{rebuild()}catch(error){ui.status.textContent=`RENDER ERROR: ${error.message}`;dirty=false;rebuildGate.markFailure();playing=false;$('play').textContent='▶';$('play').setAttribute('aria-label','Play animation');$('play').setAttribute('aria-pressed','false')}lastBuild=now}controls.update();renderer.render(scene,camera)}requestAnimationFrame(frame);
}catch(error){ui.status.textContent=`GRAPHICS UNAVAILABLE: ${error.message}`}
