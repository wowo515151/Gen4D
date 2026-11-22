import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildFieldGrid} from '../field-worker.js';
import {equations,sets,sample} from '../fields.js';
import {levelColor} from '../level-colors.js';

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

function bundledThreeHarness() {
  const context={};
  vm.runInNewContext(readFileSync(new URL('../vendor/three.min.js',import.meta.url),'utf8'),context);
  const THREE=context.THREE;
  assert.equal(THREE.REVISION,'128','the locally bundled Three.js runtime loaded');
  class TestRenderer {
    static instances=[];
    constructor() { this.domElement={}; this.scenes=[]; TestRenderer.instances.push(this); }
    setPixelRatio() {}
    setSize() {}
    render(scene) { this.scenes.push(scene); }
  }
  class TestOrbitControls { constructor(){this.target=new THREE.Vector3();} update(){} }
  return {THREE:{...THREE,WebGLRenderer:TestRenderer,OrbitControls:TestOrbitControls},TestRenderer};
}

function installAppHarness(t,resolution,withBundledThree=false) {
  const ids=['set','equation','mode','resolution','levels','level','playback-speed','status','temporal-warning','parameters','term-controls','resolution-value','sampling-warning','formula','field-name','pde','description','levels-value','level-value','legend','play','time','reset','viewport','field-accessible-summary'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  elements.resolution.value=String(resolution); elements.levels.value='1'; elements.level.value='0.25';
  elements.mode.value='surface'; elements['playback-speed'].value='1';
  const frames=[]; let now=0;
  const documentListeners={};
  const globalNames=['document','window','Worker','devicePixelRatio','Option','ResizeObserver','requestAnimationFrame','addEventListener','performance'];
  const originalGlobals=new Map(globalNames.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  globalThis.document={visibilityState:'visible',getElementById:id=>elements[id],createElement:()=>new Element(),createTextNode:text=>({textContent:text}),addEventListener(type,callback){(documentListeners[type]??=[]).push(callback)}};
  const bundled=withBundledThree?bundledThreeHarness():null;
  const fakeThree={
    Scene:class extends Object3D {}, Group:class extends Object3D {},
    PerspectiveCamera:class {constructor(){this.position={set(){}};} updateProjectionMatrix(){} lookAt(){}},
    WebGLRenderer:class {constructor(){this.domElement={};} setPixelRatio(){} setSize(){} render(){}},
    OrbitControls:class {constructor(){this.target=new Vector3();} update(){}},
    HemisphereLight:class {}, DirectionalLight:class {constructor(){this.position={set(){}};}},
    BoxGeometry:Geometry, EdgesGeometry:Geometry, LineBasicMaterial:Material, LineSegments:class {constructor(geometry,material){this.geometry=geometry;this.material=material;}},
    BufferGeometry:Geometry, Float32BufferAttribute:class {constructor(array,itemSize){this.array=array;this.itemSize=itemSize;}},
    MeshStandardMaterial:Material, Mesh:class {constructor(geometry,material){this.geometry=geometry;this.material=material;}},
    Vector3,
  };
  if(bundled) Object.assign(fakeThree,bundled.THREE);
  globalThis.window={THREE:fakeThree};
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
    if(bundled) bundled.TestRenderer.instances=[];
  });
  return {elements,rendererClass:bundled?.TestRenderer,stepFrame:timestamp=>{now=timestamp;const frame=frames.shift();assert.ok(frame,'app scheduled a frame');frame(timestamp)}};
}

test('reachable boundary worker result reaches the real Three.js scene and UI snapshot', async t => {
  const {elements,rendererClass,stepFrame}=installAppHarness(t,13,true);
  await import(`../app.js?boundary-integration=${Date.now()}`);

  // Select the production EM traveling wave and configure the exact lower-face
  // fixture already covered by field-worker.test.js.
  elements.set.value='em'; elements.set.dispatch('change');
  elements.equation.value='0'; elements.equation.dispatch('change');
  elements.resolution.value='13';
  elements.level.value='-0.4';
  for(const [id,value] of [['param-k','0.1'],['param-phase','4.7'],['param-parameter','0.5']]) {
    const input=elements.parameters.children.flatMap(wrap=>wrap.children).find(child=>child.id===id);
    assert.ok(input,`${id} is exposed by the real parameter controls`);
    input.value=value; input.dispatch('change');
  }
  for(let index=0;index<elements['term-controls'].children.length;index++) {
    const inputs=elements['term-controls'].children[index].children.flatMap(wrap=>wrap.children);
    const edits=index===0?{x:'1',y:'0',z:'0',weight:'1',phase:'0'}:{weight:'0'};
    for(const [key,value] of Object.entries(edits)) {
      const input=inputs.find(child=>child.id===`term-${index}-${key}`);
      assert.ok(input,`term ${index+1} exposes ${key}`);
      input.value=value; input.dispatch('change');
    }
  }

  const sampleTime=1.9825573136559704;
  stepFrame(sampleTime*1000);
  const worker=FakeWorker.instances[0];
  assert.equal(worker.requests.length,1,'the selected UI state is submitted to the worker');
  const request=worker.requests[0];
  assert.equal(request.levels[0],-0.4);
  assert.equal(request.params.k,0.1);
  assert.equal(request.params.phase,4.7);
  assert.deepEqual(request.params.terms[0],{vector:[1,0,0],weight:1,phase:0});
  assert.ok(request.params.terms.slice(1).every(({weight})=>weight===0),'other equation terms are disabled');
  assert.equal(request.n,13);
  const result=buildFieldGrid(request);
  assert.equal(result.levels[0].positions.length/9,288,'the reachable boundary fixture emits 288 triangles');
  worker.reply(result);

  assert.equal(elements.status.textContent,'1 LEVEL VISIBLE · GRID 13³');
  assert.equal(elements.time.textContent,'1.98');
  const scene=rendererClass.instances[0].scenes.at(-1);
  const surfaceGroup=scene.children.find(child=>child.isGroup);
  assert.equal(surfaceGroup.children.length,1);
  const mesh=surfaceGroup.children[0];
  assert.equal(mesh.isMesh,true);
  assert.equal(mesh.geometry.getAttribute('position').count,288*3);
  assert.equal(mesh.material.color.getHex(),levelColor(0),'the rendered mesh uses the matching first-level color');
});

test('real controls can configure and render an internal tangent plane with phase opposition', async t => {
  const {elements,stepFrame}=installAppHarness(t,13);
  await import(`../app.js?tangent-integration=${Date.now()}`);
  elements.set.value='em'; elements.set.dispatch('change');
  elements.equation.value='1'; elements.equation.dispatch('change');
  elements.level.value='0'; elements.level.dispatch('input');
  const edit=(termIndex,key,value)=>{
    const input=elements['term-controls'].children[termIndex].children.flatMap(child=>child.children).find(child=>child.id===`term-${termIndex}-${key}`);
    assert.ok(input,`term ${termIndex+1} exposes ${key}`);
    input.value=String(value); input.dispatch('change');
    return input;
  };
  edit(0,'x',0);edit(0,'y',0);edit(0,'z',0);edit(0,'weight',1);edit(0,'phase',0);
  edit(1,'x',1);edit(1,'y',0);edit(1,'z',0);edit(1,'weight',1);
  const phase=edit(1,'phase',Math.PI);
  assert.equal(phase.valueAsNumber,Math.PI,'the displayed phase bounds accept π');
  elements.play.dispatch('click'); // Freeze the production simulation clock at exactly t=0.
  stepFrame(200);
  const worker=FakeWorker.instances[0],request=worker.requests.at(-1);
  assert.equal(request.setId,'em');assert.equal(request.equationIndex,1);assert.equal(request.time,0);assert.deepEqual(request.levels,[0]);
  assert.deepEqual(request.params.terms,[
    {vector:[0,0,0],weight:1,phase:0},
    {vector:[1,0,0],weight:1,phase:Math.PI}
  ]);
  const result=buildFieldGrid(request);
  assert.equal(result.levels[0].positions.length/9,288);
  worker.reply(result);
  assert.equal(elements.status.textContent,'1 LEVEL VISIBLE · GRID 13³');
});

test('three-level EM tangent field keeps level identity in tubes and recovers from the edge limit', async t => {
  const {elements,rendererClass,stepFrame}=installAppHarness(t,13,true);
  await import(`../app.js?three-level-tangent-integration=${Date.now()}`);
  elements.set.value='em'; elements.set.dispatch('change');
  elements.equation.value='1'; elements.equation.dispatch('change');
  elements.mode.value='tube'; elements.mode.dispatch('input');
  elements.levels.value='3'; elements.levels.dispatch('input');
  elements['playback-speed'].value='0.5'; elements['playback-speed'].dispatch('change');

  const parameter=(key,value)=>{
    const input=elements.parameters.children.flatMap(wrap=>wrap.children).find(child=>child.id===`param-${key}`);
    assert.ok(input,`${key} is exposed by the real parameter controls`);
    input.value=String(value); input.dispatch('change');
  };
  parameter('k',1.2); parameter('phase',0.75);
  const edit=(termIndex,key,value)=>{
    const input=elements['term-controls'].children[termIndex].children.flatMap(child=>child.children).find(child=>child.id===`term-${termIndex}-${key}`);
    assert.ok(input,`term ${termIndex+1} exposes ${key}`);
    input.value=String(value); input.dispatch('change');
  };
  for(const [key,value] of Object.entries({x:0,y:0,z:0,weight:1,phase:-0.75})) edit(0,key,value);
  for(const [key,value] of Object.entries({x:1,y:0,z:0,weight:1,phase:Math.PI})) edit(1,key,value);

  // At t=0.625 the two editable EM components still sum to (1-cos(1.2x))/2.
  stepFrame(1250);
  const worker=FakeWorker.instances[0],request=worker.requests.at(-1);
  assert.deepEqual(request.levels,[-0.375,0,0.375]);
  assert.equal(request.time,0.625);
  assert.equal(request.tubular,true);
  assert.deepEqual(request.params.terms,[
    {vector:[0,0,0],weight:1,phase:-0.75},
    {vector:[1,0,0],weight:1,phase:Math.PI}
  ]);
  for(const x of [0,0.5,1]) assert.ok(Math.abs(sample(sets[0],equations[1],request.params,x,0,0,request.time)-(1-Math.cos(1.2*x))/2)<1e-12,'the configured UI terms match the allowed EM field');
  const result=buildFieldGrid(request);
  assert.equal(result.time,0.625);
  assert.deepEqual(result.levels.map(({levelIndex,level})=>({levelIndex,level})),[
    {levelIndex:1,level:0},
    {levelIndex:2,level:0.375}
  ]);
  for(const surface of result.levels){
    const triangles=new Set();
    for(let offset=0;offset<surface.positions.length;offset+=9){
      const vertices=[];
      for(let point=0;point<3;point++) vertices.push(Array.from(surface.positions.slice(offset+point*3,offset+point*3+3)).map(value=>Object.is(value,-0)?0:value).join(','));
      assert.ok(vertices.every(vertex=>vertex.split(',').map(Number).every(Number.isFinite)),'all triangle coordinates are finite');
      assert.ok(!triangles.has(vertices.sort().join('|')),'each rendered triangle is unique');
      triangles.add(vertices.join('|'));
    }
    assert.equal(triangles.size,surface.positions.length/9);
    assert.ok(surface.segments.length>0&&surface.segments.length%6===0);
  }
  worker.reply(result);
  assert.equal(elements.status.textContent,'2 LEVELS VISIBLE · GRID 13³');
  assert.equal(elements.time.textContent,'0.625');
  const scene=rendererClass.instances[0].scenes.at(-1),surfaceGroup=scene.children.find(child=>child.isGroup);
  assert.equal(surfaceGroup.children.length,2);
  assert.deepEqual(Array.from(surfaceGroup.children,child=>child.material.color.getHex()),[levelColor(1),levelColor(2)]);
  assert.deepEqual(Array.from(surfaceGroup.children,child=>child.count),result.levels.map(item=>item.segments.length/6));

  // Raise frequency and grid detail to cross the shared 40,000-edge budget.
  elements.play.dispatch('click'); // Keep the sampled field time fixed during the limit and recovery checks.
  parameter('k',3); parameter('phase',1.875);
  edit(0,'phase',-1.875);
  elements.resolution.value='37'; elements.resolution.dispatch('change');
  stepFrame(1500);
  const limitedRequest=worker.requests.at(-1),limited=buildFieldGrid(limitedRequest);
  assert.equal(limitedRequest.time,0.625);
  assert.equal(limited.limitExceeded,true);
  assert.equal(limited.edgeCount,40001);
  worker.reply(limited);
  assert.match(elements.status.textContent,/DETAIL LIMIT · at least 40,001 tube edges exceed the 40,000-edge rebuild budget/);
  assert.equal(elements.time.textContent,'—');
  assert.equal(elements.play.attributes['aria-pressed'],'false');
  assert.equal(surfaceGroup.children.length,0,'the over-budget result clears the previous tube scene');

  // A user resolution change retries and recovers at 19 points.
  elements.resolution.value='19'; elements.resolution.dispatch('change');
  stepFrame(1750);
  const recoveryRequest=worker.requests.at(-1),recovered=buildFieldGrid(recoveryRequest);
  assert.equal(recoveryRequest.n,19);
  assert.equal(recovered.limitExceeded,undefined);
  assert.deepEqual(recovered.levels.map(item=>item.levelIndex),[1,2]);
  worker.reply(recovered);
  assert.equal(elements.status.textContent,'2 LEVELS VISIBLE · GRID 19³');
  assert.notEqual(elements.time.textContent,'—');
  assert.equal(surfaceGroup.children.length,2);
});

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
