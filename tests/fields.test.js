import test from 'node:test';
import assert from 'node:assert/strict';
import {sets,equations,sample,formatEquation,formatFieldSummary,clampFinite} from '../fields.js';
import {extractIsosurface} from '../lib/three-viz/plotters/shared/isosurface.js';

test('each field satisfies its PDE at multiple points and parameter settings',()=>{
  const h=0.012, points=[[0.37,-0.42,0.68,0.21],[-0.6,0.23,-0.34,1.1]];
  const settings=[{amplitude:1.4,k:1.2,phase:0.3,parameter:0.8},{amplitude:0.8,k:0.7,phase:-0.5,parameter:1.3}];
  for(const set of sets) for(const equation of equations) for(const p of settings) for(const point of points){
    const f=(...q)=>sample(set,equation,p,...q), shifted=(q,axis,delta)=>q.map((v,i)=>v+(i===axis?delta:0));
    const second=(fn,q,axis)=>(fn(...shifted(q,axis,h))-2*fn(...q)+fn(...shifted(q,axis,-h)))/(h*h);
    const lap=(...q)=>[0,1,2].reduce((sum,axis)=>sum+second(f,q,axis),0);
    const dtt=second(f,point,3), l=lap(...point), center=f(...point);
    const biharmonic=set.id==='quantum'?[0,1,2].reduce((sum,axis)=>sum+second(lap,point,axis),0):0;
    const residual=set.id==='em'?dtt-p.parameter**2*l:set.id==='relativity'?dtt-l+p.parameter**2*center:dtt+p.parameter**2*biharmonic;
    assert.ok(Math.abs(residual)<0.008,`${set.id}: ${equation.name}, residual ${residual}`);
    assert.ok(Math.abs(center)<=p.amplitude+1e-12);
  }
});

test('catalog has ten distinct patterns with legible formulas',()=>{
  assert.equal(equations.length,10);
  assert.equal(new Set(equations.map(eq=>JSON.stringify(eq.terms))).size,10);
  for(const set of sets)for(const eq of equations){assert.match(formatEquation(set,eq),/^S = A/);assert.ok(formatEquation(set,eq).includes(set.dispersion));}
  assert.match(formatEquation(sets[0],equations[4]),/Ω\(√2k\)/);
});

test('numeric field limits clamp finite values and replace nonfinite input',()=>{
  assert.equal(clampFinite(4,-3,3,0),3);
  assert.equal(clampFinite(-4,0,3,0),0);
  assert.equal(clampFinite(Number.NaN,-3,3,0),0);
  assert.equal(clampFinite(Number.POSITIVE_INFINITY,0.1,3,1),1);
});

test('editable per-wave vectors, relative amplitudes, and phase offsets preserve each PDE',()=>{
  const h=0.012,q=[0.37,-0.42,0.68,0.21],setpoints=[0.8,1.3];
  for(const set of sets){
    const equation=equations[9],terms=equation.terms.map(({vector},index)=>({vector:vector.map((value,axis)=>value*0.73+(index+axis-2)*0.11),weight:0.3+index*0.17,phase:-0.4+index*0.19}));
    for(const parameter of setpoints){
      const p={amplitude:1.2,k:1.1,phase:0.2,parameter,terms};
      const f=(...point)=>sample(set,equation,p,...point),shift=(point,axis,amount)=>point.map((value,i)=>value+(i===axis?amount:0));
      const second=(fn,point,axis)=>(fn(...shift(point,axis,h))-2*fn(...point)+fn(...shift(point,axis,-h)))/(h*h);
      const lap=(...point)=>[0,1,2].reduce((sum,axis)=>sum+second(f,point,axis),0),dtt=second(f,q,3),center=f(...q);
      const biharmonic=set.id==='quantum'?[0,1,2].reduce((sum,axis)=>sum+second(lap,q,axis),0):0;
      const residual=set.id==='em'?dtt-parameter**2*lap(...q):set.id==='relativity'?dtt-lap(...q)+parameter**2*center:dtt+parameter**2*biharmonic;
      assert.ok(Math.abs(residual)<0.012,`${set.id}: customized-wave residual ${residual}`);
      assert.ok(Math.abs(center)<=p.amplitude+1e-12);
    }
  }
  const custom=equations[4].terms.map(({vector})=>({vector,weight:0.5,phase:0.25}));
  assert.match(formatEquation(sets[1],equations[4],custom),/Σ\|aᵢ\|/);
  assert.match(formatEquation(sets[1],equations[4],[{...custom[0],vector:[0.3,1.1,0]},{...custom[1],vector:[1.2,-0.4,0]}]),/Ω\(1\.14k\)/);
  const base={amplitude:1,k:1.2,phase:0,parameter:1},shift=(point,axis,amount)=>point.map((value,i)=>value+(i===axis?amount:0));
  assert.equal(sample(sets[1],equations[0],{...base,terms:[{vector:[0,0,0],weight:1,phase:0}]},0.2,-0.3,0.5,1),Math.cos(1));
  assert.equal(sample(sets[1],equations[0],{...base,terms:[{vector:[0,0,0],weight:0,phase:0}]},0.2,-0.3,0.5,1),0);
  assert.equal(formatEquation(sets[1],equations[0],[{vector:[1,0,0],weight:0,phase:0}]),'S = 0\n'+sets[1].dispersion);
  assert.match(formatEquation(sets[1],equations[0],[{vector:[0,0,0],weight:1,phase:0}]),/cos\(k\(0\) − Ω\(0\)t/);
  for(const set of sets){
    const parameter=set.id==='quantum'?0.7:1.1,p={amplitude:1.3,k:1.2,phase:0.2,parameter,terms:[{vector:[0,0,0],weight:1,phase:0}]};
    const f=(...point)=>sample(set,equations[0],p,...point),second=(fn,point,axis)=>(fn(...shift(point,axis,h))-2*fn(...point)+fn(...shift(point,axis,-h)))/(h*h);
    const dtt=second(f,q,3),center=f(...q),lap=(...point)=>[0,1,2].reduce((sum,axis)=>sum+second(f,point,axis),0),biharmonic=set.id==='quantum'?[0,1,2].reduce((sum,axis)=>sum+second(lap,q,axis),0):0;
    const residual=set.id==='em'?dtt-parameter**2*lap(...q):set.id==='relativity'?dtt-lap(...q)+parameter**2*center:dtt+parameter**2*biharmonic;
    assert.ok(Math.abs(residual)<0.012,`${set.id}: zero-vector residual ${residual}`);
  }
});

test('accessible field summary names the selected PDE, pattern, and current parameters',()=>{
  const terms=equations[4].terms.map(({vector},index)=>({vector,weight:0.5+index,phase:0.25+index}));
  const summary=formatFieldSummary(sets[2],equations[4],{amplitude:1.4,k:0.7,phase:-0.5,parameter:1.3,terms});
  assert.match(summary,/Current field: Quantum · free Schrödinger/);
  assert.match(summary,/Pattern: Diagonal interference/);
  assert.match(summary,/PDE: ∂²S\/∂t² \+ α² ∇⁴S = 0/);
  assert.match(summary,/Formula: S = A\/Σ\|aᵢ\| \[/);
  assert.match(summary,/amplitude A 1\.4; wave number k 0\.7; phase φ -0\.5; Dispersion α 1\.3; wave components: wave 1 vector \(1, 1, 0\), relative amplitude 0\.5, phase offset 0\.25/);
});

test('isosurface extraction crosses a sampled plane at the expected position',()=>{
  const axis=[-1,0,1], grid={axes:[axis,axis,axis],cells:axis.map(x=>axis.map(()=>axis.map(()=>({value:x,row:null})))),world:(a,i)=>a[i]};
  const result=extractIsosurface(grid,0.25);assert.ok(result.triangleCount>0);for(let i=0;i<result.positions.length;i+=3)assert.ok(Math.abs(result.positions[i]-0.25)<1e-6);
});
