import test from 'node:test';
import assert from 'node:assert/strict';
import {equations,sample,sets} from '../fields.js';
import {buildFieldGrid,TUBE_EDGE_BUDGET} from '../field-worker.js';
import {levelColor} from '../level-colors.js';

const settings=(equationIndex,k=3)=>({setId:'em',equationIndex,params:{amplitude:1,k,phase:0,parameter:1,terms:equations[equationIndex].terms.map(({vector})=>({vector,weight:1,phase:0}))},time:0,levels:[0],tubular:false,revision:1});
const triangleArea=(positions)=>{let area=0;for(let offset=0;offset<positions.length;offset+=9){const [ax,ay,az,bx,by,bz,cx,cy,cz]=positions.slice(offset,offset+9),ab=[bx-ax,by-ay,bz-az],ac=[cx-ax,cy-ay,cz-az];area+=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])/2}return area};
const uniqueTriangleCount=(positions)=>new Set(Array.from({length:positions.length/9},(_,index)=>Array.from(positions.slice(index*9,index*9+9)).reduce((points,value,offset)=>{if(offset%3===0)points.push([]);points.at(-1).push(value);return points},[]).map(point=>point.join(',')).sort().join('|'))).size;
const tangentRequest=({n=13,vector=[1,1,0],k=1,spatialPhase=Math.PI,time=0,level=0,setId='em',parameter=1,amplitude=1,constantPhase=0,constantWeight=1,spatialWeight=1,tubular=false}={})=>({setId,equationIndex:1,n,levels:[level],tubular,revision:1,time,params:{amplitude,k,phase:0,parameter,terms:[{vector:[0,0,0],weight:constantWeight,phase:constantPhase},{vector,weight:spatialWeight,phase:spatialPhase}]}});

test('selected grid resolution controls geometry density through the allowed 37-point maximum',()=>{
  const coarse=buildFieldGrid({...settings(0),n:13}),fine=buildFieldGrid({...settings(0),n:37});
  assert.equal(fine.time,0,'worker results retain the sampled simulation time');
  assert.ok(fine.levels[0].positions.length>coarse.levels[0].positions.length);
  assert.equal(fine.levels[0].segments.length,0);
});

test('worker results retain time when the requested isosurface is absent',()=>{
  const result=buildFieldGrid({...settings(0),time:1.25,n:13,levels:[2]});
  assert.equal(result.time,1.25);
  assert.deepEqual(result.levels,[]);
});

test('zero-wave fields at an equal threshold produce a truthful no-surface result',()=>{
  const request={...settings(0),n:13,levels:[0],params:{...settings(0).params,terms:[{vector:[1,0,0],weight:0,phase:0}]}};
  const result=buildFieldGrid(request);
  assert.equal(result.revision,1);
  assert.equal(result.time,0);
  assert.deepEqual(result.levels,[],'a constant field equal to the requested level has no two-dimensional surface');
});

test('UI-reachable phase opposition extracts an exact internal tangent plane once',()=>{
  const request={
    setId:'em',equationIndex:1,n:13,levels:[0],tubular:false,revision:8,time:0,
    params:{amplitude:1,k:1.2,phase:0,parameter:1,terms:[
      {vector:[0,0,0],weight:1,phase:0},
      {vector:[1,0,0],weight:1,phase:Math.PI}
    ]}
  };
  const surface=buildFieldGrid(request).levels[0];
  assert.ok(surface,'the exact tangent plane is extracted');
  assert.equal(surface.positions.length/9,288,'the 12×12 square mesh has two triangles per quad');
  const triangles=new Set();
  for(let offset=0;offset<surface.positions.length;offset+=9){
    const triangle=Array.from(surface.positions.slice(offset,offset+9));
    assert.ok(triangle.every(Number.isFinite));
    assert.ok(triangle.every((value,index)=>index%3!==0||value===0),'every tangent-plane vertex has x=0');
    const [ax,ay,az,bx,by,bz,cx,cy,cz]=triangle;
    const area2=Math.hypot((by-ay)*(cz-az)-(bz-az)*(cy-ay),(bz-az)*(cx-ax)-(bx-ax)*(cz-az),(bx-ax)*(cy-ay)-(by-ay)*(cx-ax));
    assert.ok(area2>0,'each emitted triangle has nonzero area');
    const points=[[ax,ay,az],[bx,by,bz],[cx,cy,cz]].map(point=>point.join(',')).sort();
    const key=points.join('|');
    assert.ok(!triangles.has(key),'a triangle is emitted once across tetrahedra and cells');
    triangles.add(key);
  }
  assert.equal(triangles.size,288);
});

test('an oblique tangent plane covers its complete analytical section at 13 and 19 points',()=>{
  const expectedArea=36*Math.sqrt(2);
  for(const [n,count] of [[13,288],[19,648]]){
    const surface=buildFieldGrid(tangentRequest({n})).levels[0];
    assert.equal(surface.positions.length/9,count,`n=${n}: resolution controls the mesh density`);
    assert.equal(uniqueTriangleCount(surface.positions),count,`n=${n}: the grid-cell patches have no duplicate triangles`);
    assert.ok(Math.abs(triangleArea(surface.positions)-expectedArea)<1e-5,`n=${n}: the plane covers the whole cube section`);
    for(let offset=0;offset<surface.positions.length;offset+=3){
      const residual=surface.positions[offset]+surface.positions[offset+1];
      assert.ok(Math.abs(residual)<1e-6,`n=${n}: every vertex satisfies x+y=0`);
    }
  }
});

test('shifted oblique tangency emits all three clipped planes with no duplicate faces',()=>{
  const request=tangentRequest({k:1.2,spatialPhase:Math.PI+0.3});
  const surface=buildFieldGrid(request).levels[0],positions=surface.positions;
  const offsets=[-1,0,1].map(m=>(2*Math.PI*m-0.3)/1.2);
  const observed=new Set();
  assert.equal(uniqueTriangleCount(positions),positions.length/9,'all emitted triangles are unique');
  for(let offset=0;offset<positions.length;offset+=9){
    const triangle=Array.from(positions.slice(offset,offset+9)),dots=[];
    for(let vertex=0;vertex<9;vertex+=3){
      const dot=triangle[vertex]+triangle[vertex+1];dots.push(dot);
      assert.ok(offsets.some(expected=>Math.abs(dot-expected)<1e-5),'each vertex lies on one of the three exact root planes');
    }
    assert.ok(Math.max(...dots)-Math.min(...dots)<1e-5,'each triangle belongs to one plane family member');
    observed.add(Math.round(dots[0]*1e5));
  }
  assert.equal(observed.size,3,'all parallel tangent planes inside the domain are emitted');
  const expectedArea=offsets.reduce((sum,d)=>sum+6*Math.sqrt(2)*Math.max(0,Math.min(3,d+3)-Math.max(-3,d-3)),0);
  assert.ok(Math.abs(triangleArea(positions)-expectedArea)<1e-4,'clipped mesh area matches the analytical cube sections');
});

test('tangent clipping handles domain boundaries and planes close to grid faces',()=>{
  const boundary=buildFieldGrid(tangentRequest({vector:[1,0,0],k:1,spatialPhase:Math.PI+3})).levels[0];
  assert.equal(boundary.positions.length/9,288);
  assert.equal(uniqueTriangleCount(boundary.positions),288,'a plane on the domain face is emitted once');
  assert.ok(Math.abs(triangleArea(boundary.positions)-36)<1e-6);
  for(let offset=0;offset<boundary.positions.length;offset+=3)assert.equal(boundary.positions[offset],-3);

  const nearGridFace=buildFieldGrid(tangentRequest({vector:[1,0,0],k:1,spatialPhase:Math.PI-0.25})).levels[0];
  assert.equal(nearGridFace.positions.length/9,288);
  assert.equal(uniqueTriangleCount(nearGridFace.positions),288,'a plane one half cell from its neighbor has no seam duplicates');
  assert.ok(Math.abs(triangleArea(nearGridFace.positions)-36)<1e-6);
  for(let offset=0;offset<nearGridFace.positions.length;offset+=3)assert.ok(Math.abs(nearGridFace.positions[offset]-0.25)<1e-6);
});

test('strict tangent extrema preserve no-surface and sampled near-level behavior',()=>{
  const below=buildFieldGrid(tangentRequest({level:-1e-12}));
  assert.deepEqual(below.levels,[],'a level just below the minimum does not become a false tangent sheet');
  const above=buildFieldGrid(tangentRequest({level:1e-4})).levels[0];
  assert.ok(above.positions.length>0,'a nearby non-extremal crossing stays on the sampled extractor path');
  assert.ok(Array.from(above.positions).some((value,index)=>index%3===0&&Math.abs(value+above.positions[index+1])>1e-5),
    'the near-level result is not replaced by the exact x+y=0 tangent plane');
});

test('two-term normalization honors unequal wave weights and rejects constant degeneracies',()=>{
  const level=1/3;
  const weighted=buildFieldGrid(tangentRequest({vector:[1,1,0],level,constantWeight:2,spatialWeight:1,amplitude:2.5})).levels[0];
  assert.ok(weighted,'the normalized unequal-weight minimum is recognized');
  assert.ok(Math.abs(triangleArea(weighted.positions)-36*Math.sqrt(2))<1e-5);
  const constant=buildFieldGrid(tangentRequest({vector:[1,1,0],level:0,spatialWeight:0}));
  assert.deepEqual(constant.levels,[],'an inactive spatial wave does not create a plane');
});

test('maximum tangent parity and a nontrivial constant cosine phase retain exact planes',()=>{
  const maximum=buildFieldGrid(tangentRequest({constantPhase:Math.PI,spatialPhase:0})).levels[0];
  assert.equal(maximum.positions.length/9,288,'q=+1 produces one tangent plane family');
  assert.ok(Math.abs(triangleArea(maximum.positions)-36*Math.sqrt(2))<1e-5);

  const phase=0.3,level=(Math.cos(phase)-1)/2;
  const shifted=buildFieldGrid(tangentRequest({level,constantPhase:phase,spatialPhase:Math.PI+phase})).levels[0];
  assert.ok(shifted,'cosine cancellation at a nonzero constant phase is recognized');
  assert.equal(uniqueTriangleCount(shifted.positions),shifted.positions.length/9);
  const expectedOffsets=[-0.3,2*Math.PI-0.3];
  for(let offset=0;offset<shifted.positions.length;offset+=3){
    const dot=shifted.positions[offset]+shifted.positions[offset+1];
    assert.ok(expectedOffsets.some(expected=>Math.abs(dot-expected)<1e-5));
  }
});

test('oblique tangent tubes retain level identity and obey the shared edge budget',()=>{
  const request=tangentRequest({n:19,k:1,tubular:true});request.levels=[0.25,0];
  const result=buildFieldGrid(request);
  assert.deepEqual(result.levels.map(surface=>surface.levelIndex),[0,1],'sampled and analytic levels keep requested palette indices');
  assert.ok(result.levels.every(surface=>surface.segments.length>0&&surface.segments.length/6<=TUBE_EDGE_BUDGET));

  const manyPlanes=tangentRequest({n:37,vector:[3,3,3],k:3,tubular:true});
  const limited=buildFieldGrid(manyPlanes);
  assert.equal(limited.limitExceeded,true,'multiple analytic planes stop at the existing tubular edge cap');
  assert.ok(limited.edgeCount>TUBE_EDGE_BUDGET);
  assert.deepEqual(limited.levels,[],'over-budget geometry is discarded consistently');
});

test('an unbounded finite animation time falls back without entering an unsafe plane loop',()=>{
  const request=tangentRequest({n:13,time:1e300});
  const result=buildFieldGrid(request);
  assert.equal(result.revision,request.revision);
  assert.equal(result.time,request.time);
  assert.ok(Array.isArray(result.levels),'large phase indices do not hang or overflow the worker');
});

test('isolated zero edges and constant-level volumes stay empty on the sampled path',()=>{
  const isolatedEdge={...settings(2,1),equationIndex:2,n:13,levels:[1],params:{amplitude:1,k:1,phase:0,parameter:1,terms:[
    {vector:[1,0,0],weight:1,phase:0},{vector:[0,1,0],weight:1,phase:0}
  ]}};
  assert.deepEqual(buildFieldGrid(isolatedEdge).levels,[],'the line of exact maxima does not become a sheet');
  const constantRegion=tangentRequest({vector:[0,0,0],level:1,constantWeight:1,spatialWeight:1});
  assert.deepEqual(buildFieldGrid(constantRegion).levels,[],'an everywhere-equal constant field has no two-dimensional surface');
});

test('two-wave tangent planes work across EM, Klein–Gordon, and Schrödinger dispersion',()=>{
  const k=0.1,amplitude=1,n=13,t=1;
  for(const set of sets){
    const parameter=set.id==='quantum'?0.5:1;
    const base={setId:set.id,equationIndex:1,n,levels:[0],tubular:false,revision:9,
      params:{amplitude,k,phase:0,parameter,terms:[
        {vector:[0,0,0],weight:1,phase:0},
        {vector:[1,1,0],weight:1,phase:Math.PI}
      ]}};
    const atZero=buildFieldGrid({...base,time:0}).levels[0];
    assert.ok(atZero,`${set.id}: the t=0 tangent plane is present`);

    const zeroFrequency=set.omega(0,parameter),waveFrequency=set.omega(k*Math.SQRT2,parameter);
    assert.equal(zeroFrequency,set.id==='relativity'?parameter:0,`${set.id}: zero-vector dispersion`);
    const adjusted={...base,params:{...base.params,phase:zeroFrequency*t,terms:[
      base.params.terms[0],
      {...base.params.terms[1],phase:Math.PI+(waveFrequency-zeroFrequency)*t}
    ]}};
    assert.ok(Math.abs(adjusted.params.phase)<=6.28&&Math.abs(adjusted.params.terms[1].phase)<=6.28,
      `${set.id}: t=1 compensation fits the UI phase bounds`);
    const atOne=buildFieldGrid({...adjusted,time:t}).levels[0];
    assert.ok(atOne,`${set.id}: the phase-adjusted t=1 tangent plane is present`);
    assert.equal(atZero.positions.length/9,288,`${set.id}: the 12×12 tangent mesh has two triangles per square`);
    assert.equal(atOne.positions.length/9,288,`${set.id}: the nonzero-time mesh has the same unique triangle count`);
    for(const surface of [atZero,atOne]){
      assert.equal(surface.levelIndex,0,`${set.id}: the returned surface retains the requested level index`);
      assert.equal(surface.level,0,`${set.id}: the returned surface retains the requested level`);
    }
    assert.equal(levelColor(atOne.levelIndex),levelColor(0),`${set.id}: the requested level retains its palette color`);

    for(const surface of [atZero,atOne]){
      const unique=new Set();
      assert.ok(surface.positions.every(Number.isFinite),`${set.id}: all positions are finite`);
      for(let offset=0;offset<surface.positions.length;offset+=9){
        const triangle=Array.from(surface.positions.slice(offset,offset+9));
        for(let index=0;index<triangle.length;index+=3)assert.ok(Math.abs(triangle[index]+triangle[index+1])<1e-6,`${set.id}: every vertex lies on x+y=0`);
        const [ax,ay,az,bx,by,bz,cx,cy,cz]=triangle;
        const ab=[bx-ax,by-ay,bz-az],ac=[cx-ax,cy-ay,cz-az];
        const area2=Math.hypot((by-ay)*(cz-az)-(bz-az)*(cy-ay),(bz-az)*(cx-ax)-(bx-ax)*(cz-az),(bx-ax)*(cy-ay)-(by-ay)*(cx-ax));
        assert.ok(area2>0,`${set.id}: every triangle has nonzero area`);
        const key=[[ax,ay,az],[bx,by,bz],[cx,cy,cz]].map(point=>point.join(',')).sort().join('|');
        assert.ok(!unique.has(key),`${set.id}: no duplicate triangles`);
        unique.add(key);
      }
      assert.equal(unique.size,288,`${set.id}: all emitted triangles are unique`);
    }

    const offTangent={...base,params:{...base.params,terms:[
      base.params.terms[0],{...base.params.terms[1],phase:Math.PI+1}
    ]}};
    const sampled=Array.from({length:n},(_,index)=>sample(set,equations[1],offTangent.params,-3+6*index/(n-1),0,0,0));
    assert.ok(sampled.every(value=>value>0),`${set.id}: the non-tangent x samples stay strictly above level zero`);
    assert.deepEqual(buildFieldGrid({...offTangent,time:0}).levels,[],`${set.id}: no surface is reported away from tangency`);
  }
});

test('worker preserves a nonconstant traveling-wave level that lies exactly on the lower domain face',()=>{
  const request={
    setId:'em',equationIndex:0,n:13,levels:[-.4],tubular:false,revision:7,time:1.9825573136559704,
    params:{amplitude:1,k:.1,phase:4.7,parameter:.5,terms:[{vector:[1,0,0],weight:1,phase:0}]}
  };
  const {params,time}=request;
  assert.equal(sample(sets[0],equations[0],params,-3,0,0,time),-.4,'the boundary sample equals the requested level exactly');
  assert.ok(sample(sets[0],equations[0],params,-2.5,0,0,time)>-.4,'the inward sample is strictly above the level');
  const result=buildFieldGrid(request),surface=result.levels[0];
  assert.equal(surface.positions.length/9,288,'the exact x=-3 face is emitted once as two triangles per grid quad');
  assert.equal(surface.level,-.4);
  for(let offset=0;offset<surface.positions.length;offset+=9){
    const [ax,ay,az,bx,by,bz,cx,cy,cz]=surface.positions.slice(offset,offset+9);
    assert.equal(ax,-3);assert.equal(bx,-3);assert.equal(cx,-3);
    const ab=[bx-ax,by-ay,bz-az],ac=[cx-ax,cy-ay,cz-az];
    const normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    assert.ok(normal.some(component=>component!==0),'the emitted Float32 face triangles have nonzero area');
  }
});

test('skipped earlier and middle levels retain their requested identity and color',()=>{
  const requested=[2,0,-2,.5];
  const result=buildFieldGrid({...settings(0),n:13,levels:requested});
  assert.deepEqual(result.levels.map(({levelIndex,level})=>({levelIndex,level})),[
    {levelIndex:1,level:0},
    {levelIndex:3,level:.5}
  ]);
  assert.deepEqual(result.levels.map(item=>levelColor(item.levelIndex)),[levelColor(1),levelColor(3)]);
  assert.notEqual(levelColor(1),levelColor(0),'the first surviving surface keeps the second legend color');
  assert.notEqual(levelColor(3),levelColor(1),'the later surface keeps its fourth legend color');
});

test('four-level EM traveling wave keeps the fourth legend color when only the last level crosses',()=>{
  const result=buildFieldGrid({...settings(0,.4),n:13,levels:[-.45,-.15,.15,.45]});
  assert.deepEqual(result.levels.map(({levelIndex,level})=>({levelIndex,level})),[
    {levelIndex:3,level:.45}
  ]);
  assert.equal(levelColor(result.levels[0].levelIndex),levelColor(3));
  assert.notEqual(levelColor(result.levels[0].levelIndex),levelColor(0),'the surviving surface matches the fourth legend swatch');
});

test('four-level default pattern remains inside the tube budget at 19 points',()=>{
  const request={...settings(5,1.2),n:19,levels:[-.45,-.15,.15,.45],tubular:true};
  const result=buildFieldGrid(request),edges=result.levels.reduce((sum,item)=>sum+item.segments.length/6,0);
  assert.ok(edges>0&&edges<=TUBE_EDGE_BUDGET,`${edges} unique tube edges`);
});

test('high-frequency four-level weave stops and discards geometry when the tube budget is exceeded',()=>{
  const request={...settings(9,3),n:19,levels:[-.45,-.15,.15,.45],tubular:true};
  const result=buildFieldGrid(request);
  assert.equal(result.limitExceeded,true);
  assert.ok(result.edgeCount>TUBE_EDGE_BUDGET,`${result.edgeCount} unique tube edges should exceed ${TUBE_EDGE_BUDGET}`);
  assert.equal(result.edgeCount,TUBE_EDGE_BUDGET+1,'segment collection stops immediately after the first over-budget edge');
  assert.deepEqual(result.levels,[],'over-budget jobs discard extracted buffers before transfer');
});
