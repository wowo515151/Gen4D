import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFieldGrid} from '../field-worker.js';

// Run the real app module against a small deterministic browser surface. The
// worker is controlled by the test so replies can be delivered out of order;
// each reply still comes from the real field-grid builder.
class Element {
  constructor(id='') {
    this.id=id; this.children=[]; this.listeners={}; this.attributes={};
    this.textContent=''; this.value=''; this.hidden=false; this.disabled=false;
    this.clientWidth=800; this.clientHeight=600; this.style={};
  }
  addEventListener(type,callback) { (this.listeners[type]??=[]).push(callback); }
  dispatch(type,event={}) { for(const callback of this.listeners[type]??[]) callback({target:this,...event}); }
  append(...items) { this.children.push(...items); }
  add(item) { this.children.push(item); }
  replaceChildren(...items) { this.children=[...items]; }
  setAttribute(name,value) { this.attributes[name]=String(value); }
  get valueAsNumber() { return Number(this.value); }
}

class Object3D {
  constructor() { this.children=[]; this.position={set(){}}; this.rotation={set(){}}; }
  add(object) { this.children.push(object); }
  remove(object) { this.children=this.children.filter(child=>child!==object); }
}
class Geometry { constructor() { this.attributes={}; this.disposeCount=0; }
  setAttribute(name,value) { this.attributes[name]=value; }
  computeVertexNormals() {}
  dispose() { this.disposeCount++; }
}
class Material { constructor(options={}) { this.options=options; this.disposeCount=0; }
  dispose() { this.disposeCount++; }
}
class Vector3 { set() { return this; } subVectors() { return this; } }
class FakeWorker {
  static instances=[];
  constructor() { this.listeners={}; this.requests=[]; FakeWorker.instances.push(this); }
  addEventListener(type,callback) { (this.listeners[type]??=[]).push(callback); }
  postMessage(request) { this.requests.push(request); }
  reply(result) { for(const callback of this.listeners.message??[]) callback({data:result}); }
  fail(error=new Error('worker failed')) { for(const callback of this.listeners.error??[]) callback({error,message:error.message,preventDefault(){}}); }
  terminate() {}
}

function installAppHarness(t,resolution) {
  const ids=['set','equation','mode','resolution','levels','level','playback-speed','status','temporal-warning','parameters','term-controls','resolution-value','sampling-warning','formula','field-name','pde','description','levels-value','level-value','legend','play','time','reset','viewport','field-accessible-summary'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  elements.resolution.value=String(resolution); elements.levels.value='1'; elements.level.value='0.25';
  elements.mode.value='surface'; elements['playback-speed'].value='1';
  const frames=[]; let now=0;
  const documentListeners={};
  const globalNames=['document','window','Worker','devicePixelRatio','Option','ResizeObserver','requestAnimationFrame','addEventListener','performance'];
  const originalGlobals=new Map(globalNames.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  globalThis.document={visibilityState:'visible',getElementById:id=>elements[id],createElement:()=>new Element(),createTextNode:text=>({textContent:text}),addEventListener(type,callback){(documentListeners[type]??=[]).push(callback)}};
  globalThis.window={THREE:{
    Scene:class extends Object3D {}, Group:class extends Object3D {},
    PerspectiveCamera:class {constructor(){this.position={set(){}};} updateProjectionMatrix(){} lookAt(){}},
    WebGLRenderer:class {constructor(){this.domElement={};} setPixelRatio(){} setSize(){} render(){}},
    OrbitControls:class {constructor(){this.target=new Vector3();} update(){}},
    HemisphereLight:class {}, DirectionalLight:class {constructor(){this.position={set(){}};}},
    BoxGeometry:Geometry, EdgesGeometry:Geometry, LineBasicMaterial:Material, LineSegments:class {constructor(geometry,material){this.geometry=geometry;this.material=material;}},
    BufferGeometry:Geometry, Float32BufferAttribute:class {constructor(array,itemSize){this.array=array;this.itemSize=itemSize;}},
    MeshStandardMaterial:Material, Mesh:class {constructor(geometry,material){this.geometry=geometry;this.material=material;}},
    Vector3,
  }};
  globalThis.Worker=FakeWorker; globalThis.devicePixelRatio=1;
  globalThis.Option=class {constructor(text,value){this.text=text;this.value=value;}};
  globalThis.ResizeObserver=class {constructor(callback){this.callback=callback;} observe(){this.callback();}};
  globalThis.requestAnimationFrame=callback=>frames.push(callback);
  globalThis.addEventListener=()=>{};
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
  t.after(()=>{
    for(const [name,descriptor] of originalGlobals){
      if(descriptor) Object.defineProperty(globalThis,name,descriptor);
      else delete globalThis[name];
    }
    FakeWorker.instances=[];
  });
  return {elements,stepFrame:timestamp=>{now=timestamp;const frame=frames.shift();assert.ok(frame,'app scheduled a frame');frame(timestamp)}};
}

test('app discards a stale worker reply and displays a paused no-surface snapshot', async t => {
  const ids=['set','equation','mode','resolution','levels','level','playback-speed','status','temporal-warning','parameters','term-controls','resolution-value','sampling-warning','formula','field-name','pde','description','levels-value','level-value','legend','play','time','reset','viewport','field-accessible-summary'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  elements.resolution.value='19'; elements.levels.value='1'; elements.level.value='0.25';
  elements.mode.value='surface'; elements['playback-speed'].value='1';
  const frames=[]; let now=0;
  const documentListeners={};
  const globalNames=['document','window','Worker','devicePixelRatio','Option','ResizeObserver','requestAnimationFrame','addEventListener','performance'];
  const originalGlobals=new Map(globalNames.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  globalThis.document={visibilityState:'visible',getElementById:id=>elements[id],createElement:()=>new Element(),createTextNode:text=>({textContent:text}),addEventListener(type,callback){(documentListeners[type]??=[]).push(callback)}};
  globalThis.window={THREE:{
    Scene:class extends Object3D {}, Group:class extends Object3D {},
    PerspectiveCamera:class {constructor(){this.position={set(){}};} updateProjectionMatrix(){} lookAt(){}},
    WebGLRenderer:class {constructor(){this.domElement={};} setPixelRatio(){} setSize(){} render(){}},
    OrbitControls:class {constructor(){this.target=new Vector3();} update(){}},
    HemisphereLight:class {}, DirectionalLight:class {constructor(){this.position={set(){}};}},
    BoxGeometry:Geometry, EdgesGeometry:Geometry, LineBasicMaterial:Material, LineSegments:class {constructor(geometry,material){this.geometry=geometry;this.material=material;}},
    BufferGeometry:Geometry, Float32BufferAttribute:class {constructor(array,itemSize){this.array=array;this.itemSize=itemSize;}},
    MeshStandardMaterial:Material, Mesh:class {constructor(geometry,material){this.geometry=geometry;this.material=material;}},
    Vector3,
  }};
  globalThis.Worker=FakeWorker; globalThis.devicePixelRatio=1;
  globalThis.Option=class {constructor(text,value){this.text=text;this.value=value;}};
  globalThis.ResizeObserver=class {constructor(callback){this.callback=callback;} observe(){this.callback();}};
  globalThis.requestAnimationFrame=callback=>frames.push(callback);
  globalThis.addEventListener=()=>{};
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
  t.after(()=>{
    for(const [name,descriptor] of originalGlobals){
      if(descriptor) Object.defineProperty(globalThis,name,descriptor);
      else delete globalThis[name];
    }
    FakeWorker.instances=[];
  });

  await import(`../app.js?integration=${Date.now()}`);
  const worker=FakeWorker.instances[0];
  assert.ok(worker,'app starts its field worker');
  const stepFrame=timestamp=>{now=timestamp;const frame=frames.shift();assert.ok(frame,'app scheduled a frame');frame(timestamp);};

  stepFrame(1000);
  assert.equal(worker.requests.length,1,'first frame submits the initial field');
  const staleRequest=worker.requests[0];
  const staleResult=buildFieldGrid(staleRequest);
  assert.ok(staleResult.levels.length>0,'the old request would visibly replace the snapshot if accepted');

  // Apply three real parameter input events while the first request is in flight.
  for(let index=0;index<3;index++){
    const weightInput=elements['term-controls'].children[index]?.children?.flatMap(child=>child.children??[]).find(child=>child.id===`term-${index}-weight`);
    assert.ok(weightInput,`wave ${index+1} exposes an editable weight`);
    weightInput.value='0'; weightInput.dispatch('change');
  }
  worker.reply(staleResult);
  assert.match(elements.status.textContent,/BUILDING 19³ FIELD GRID/,'a stale result does not replace the current build status');

  stepFrame(1200);
  assert.equal(worker.requests.length,2,'the latest edit is submitted after the stale job releases the worker slot');
  const currentRequest=worker.requests[1];
  assert.ok(currentRequest.revision>staleRequest.revision,'the edited request has a newer revision');
  assert.ok(currentRequest.params.terms.every(term=>term.weight===0),'the real UI edits reached the worker request');
  const currentResult=buildFieldGrid(currentRequest);
  assert.deepEqual(currentResult.levels,[],'the real worker builder returns no surface for a zero field above level zero');
  worker.reply(currentResult);
  assert.equal(elements.status.textContent,'NO SURFACE AT THIS LEVEL · FIELD SNAPSHOT UPDATED');
  assert.equal(elements.time.textContent,'1.20','displayed time comes from the accepted worker snapshot');

  elements.play.dispatch('click');
  assert.equal(elements.play.attributes['aria-pressed'],'false','pause action reaches the app handler');
  assert.equal(elements.time.textContent,'1.20','pausing anchors the clock to the displayed no-surface snapshot');
  assert.equal(elements.status.textContent,'NO SURFACE AT THIS LEVEL · FIELD SNAPSHOT UPDATED');
});

test('worker error callback pauses large grids and recovery uses the 19-point fallback', async t => {
  const {elements,stepFrame}=installAppHarness(t,25);
  await import(`../app.js?worker-error-integration=${Date.now()}`);
  const worker=FakeWorker.instances[0];
  assert.ok(worker,'app starts its field worker');

  stepFrame(1000);
  assert.equal(worker.requests.length,1,'the initial 25-point grid is submitted to the worker');
  worker.fail();
  assert.equal(elements.status.textContent,'BACKGROUND BUILDER UNAVAILABLE · choose at most 19 grid points','the production worker error callback updates status');

  stepFrame(1200);
  assert.equal(elements.status.textContent,'BACKGROUND BUILDER UNAVAILABLE · choose at most 19 grid points');
  assert.equal(elements.play.attributes['aria-pressed'],'false','an unsupported large-grid build pauses playback');
  assert.equal(elements.time.textContent,'—','failed worker output does not present a sampled time');

  elements.resolution.value='19';
  elements.resolution.dispatch('change');
  stepFrame(2000);
  assert.equal(worker.requests.length,1,'the failed worker stays terminated and is not reused');
  assert.match(elements.status.textContent,/^(\d+ LEVELS? VISIBLE · GRID 19³|NO SURFACE AT THIS LEVEL · FIELD SNAPSHOT UPDATED)$/,'a user resolution change recovers through the real synchronous field builder');
  assert.notEqual(elements.time.textContent,'—','the fallback snapshot restores displayed sampled time');
});
