// Mathematical references reviewed in the companion README:
// Klein–Gordon and free Schrödinger equations/plane waves: Likharev, §9.5.
// Vacuum electromagnetic wave equation and wave speed: Staelin, §2.2.
// Each catalog member is an analytically derived real scalar plane-wave
// superposition; this does not specify a full electromagnetic or quantum field.
export const sets = [
  {id:'em',name:'Electromagnetism · vacuum wave',pde:'∂²S/∂t² = c² ∇²S',dispersion:'Ω(q) = cq',description:'An idealized scalar wave satisfying the vacuum electromagnetic wave equation. An electromagnetic field also needs a transverse polarization satisfying Maxwell’s equations.',parameter:'c',parameterLabel:'Wave speed c',parameterValue:0.2,omega:(q,p)=>p*q},
  {id:'relativity',name:'Relativity · Klein–Gordon',pde:'∂²S/∂t² = ∇²S − μ²S',dispersion:'Ω(q) = √(q² + μ²)',description:'A real scalar Klein–Gordon field in units where c = 1. μ is the mass-frequency parameter.',parameter:'mu',parameterLabel:'Mass parameter μ',parameterValue:1,omega:(q,p)=>Math.hypot(q,p)},
  {id:'quantum',name:'Quantum · free Schrödinger',pde:'∂²S/∂t² + α² ∇⁴S = 0',dispersion:'Ω(q) = αq²',description:'The real part of a free Schrödinger wavefunction. α = ℏ/(2m); the imaginary part is needed to describe the full complex wavefunction.',parameter:'alpha',parameterLabel:'Dispersion α',parameterValue:0.5,omega:(q,p)=>p*q*q}
];

// Wave vectors are integer multiples of k; opposite vectors create standing waves.
// The sum is divided by the number of terms, keeping |S| ≤ A for all presets.
const term=(x,y,z)=>({vector:[x,y,z],magnitude:Math.hypot(x,y,z)});
export function clampFinite(value,min,max,fallback=0){return Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback}
/** Read a number input without treating its empty/invalid state as numeric zero. */
export function numericInputValue(value,min,max,fallback=0){return clampFinite(value,min,max,fallback)}
export function samplesPerShortestWavelength(terms,k,spacing){
  const maxComponent=terms.reduce((maximum,term)=>term.weight===0?maximum:Math.max(maximum,...term.vector.map(value=>Math.abs(value))),0);
  return maxComponent===0?Infinity:2*Math.PI/(k*maxComponent*spacing);
}
export function samplingWarning(terms,k,spacing,gridPoints){
  const samples=samplesPerShortestWavelength(terms,k,spacing);
  if(samples>=4)return null;
  const nyquist=samples<=2?' At or below the Nyquist limit, this component may be aliased.':'';
  return `Sampling warning: this ${gridPoints}-point grid gives about ${samples.toFixed(1)} intervals per shortest active axis-component wavelength; fewer than 4 can miss or distort a surface.${nyquist} The plot is a visual approximation.`;
}
export const equations = [
  {name:'Traveling plane',terms:[term(1,0,0)]},
  {name:'Standing plane',terms:[term(1,0,0),term(-1,0,0)]},
  {name:'Crossed traveling waves',terms:[term(1,0,0),term(0,1,0)]},
  {name:'Crossed standing waves',terms:[term(1,0,0),term(-1,0,0),term(0,1,0),term(0,-1,0)]},
  {name:'Diagonal interference',terms:[term(1,1,0),term(1,-1,0)]},
  {name:'Three-axis interference',terms:[term(1,0,0),term(0,1,0),term(0,0,1)]},
  {name:'Three-axis standing field',terms:[term(1,0,0),term(-1,0,0),term(0,1,0),term(0,-1,0),term(0,0,1),term(0,0,-1)]},
  {name:'Oblique lattice',terms:[term(1,1,0),term(1,0,1),term(0,1,1)]},
  {name:'Harmonic interference',terms:[term(1,0,0),term(2,0,0)]},
  {name:'Three-dimensional weave',terms:[term(1,1,1),term(1,-1,-1),term(-1,1,-1),term(-1,-1,1)]}
];

export function sample(set,equation,params,x,y,z,t){
  const {amplitude,k,phase,parameter}=params;
  const terms=params.terms?.length===equation.terms.length?params.terms:equation.terms.map(({vector})=>({vector,weight:1,phase:0}));
  const normalization=terms.reduce((sum,item)=>sum+Math.abs(item.weight??1),0);
  if(normalization===0)return 0;
  let sum=0;
  for(const item of terms){
    const [vx,vy,vz]=item.vector,magnitude=Math.hypot(vx,vy,vz),weight=item.weight??1,offset=item.phase??0;
    sum+=weight*Math.cos(k*(vx*x+vy*y+vz*z)-set.omega(k*magnitude,parameter)*t+phase+offset);
  }
  return amplitude*sum/normalization;
}

export function formatEquation(set,equation,configuredTerms){
  const terms=configuredTerms?.length===equation.terms.length?configuredTerms:equation.terms.map(({vector})=>({vector,weight:1,phase:0}));
  if(terms.every(({weight=1})=>weight===0))return `S = 0\n${set.dispersion}`;
  const spatial=([x,y,z])=>{
    const parts=[[x,'x'],[y,'y'],[z,'z']].filter(([value])=>value!==0);
    return parts.length?parts.map(([value,variable],i)=>`${value<0?'−':i?'+':''}${Math.abs(value)===1?'':Math.abs(value)}${variable}`).join(''):'0';
  };
  const numberText=value=>Object.is(value,-0)?'0':String(value);
  const formatted=terms.map(({vector,weight=1,phase=0},index)=>{const magnitude=Math.hypot(...vector),squared=Math.round(magnitude*magnitude),integerVector=vector.every(Number.isInteger),factor=integerVector?(Number.isInteger(Math.sqrt(squared))?String(Math.sqrt(squared)):`√${squared}`):`≈${numberText(magnitude)}`;const omega=factor==='1'?'k':factor==='0'?'0':`${factor}k`;const coefficient=weight===1?'':`${numberText(weight)}·`;const offset=phase===0?'':` + Δφ${index+1}`;return `${coefficient}cos(k(${spatial(vector)}) − Ω(${omega})t + φ${offset})`});
  const defaultWeights=terms.every(({weight=1,phase=0},index)=>weight===1&&phase===0&&JSON.stringify(terms[index].vector)===JSON.stringify(equation.terms[index].vector));
  const denominator=defaultWeights?(terms.length===1?'':`/${terms.length}`):'/Σ|aᵢ|';
  return `S = A${denominator} [${formatted.join(' + ')}]\n${set.dispersion}`;
}

export function formatFieldSummary(set,equation,params){
  const values=[`amplitude A ${params.amplitude}`,`wave number k ${params.k}`,`phase φ ${params.phase}`,`${set.parameterLabel} ${params.parameter}`];
  const terms=params.terms?.map(({vector,weight,phase},index)=>`wave ${index+1} vector (${vector.map(value=>Object.is(value,-0)?'0':String(value)).join(', ')}), relative amplitude ${weight}, phase offset ${phase}`).join('; ');
  return `Current field: ${set.name}. Pattern: ${equation.name}. PDE: ${set.pde}. Formula: ${formatEquation(set,equation,params.terms).replace(/\n/g,'; ')}. Parameters: ${values.join('; ')}${terms?`; wave components: ${terms}`:''}.`;
}
