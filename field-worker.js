import {sets,equations,sample} from './fields.js';
import {extractIsosurface} from './lib/three-viz/plotters/shared/isosurface.js';
import {uniqueTriangleSegmentPositions} from './lib/three-viz/plotters/shared/wireframe.js';

export const TUBE_EDGE_BUDGET=40000;

const CUBE_CORNERS=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const CUBE_EDGES=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const MAX_ANALYTIC_TANGENT_PLANES=128;

function vectorDot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}

// Clip one analytically known tangent plane into grid cells. Cell-level
// subdivision preserves the selected resolution; an axis-aligned plane that
// lies on a grid face is assigned to one neighboring cell only.
function clipTangentPlaneToGrid(grid,normal,offset){
  const [xs,ys,zs]=grid.axes,axes=[xs,ys,zs],dimensions=axes.map(axis=>axis.length),positions=[];
  const nonzeroAxes=[];for(let axis=0;axis<3;axis+=1)if(normal[axis]!==0)nonzeroAxes.push(axis);
  let faceAxis=-1,faceCell=-1;
  if(nonzeroAxes.length===1){
    faceAxis=nonzeroAxes[0];
    const coordinate=offset/normal[faceAxis],axis=axes[faceAxis],faceIndex=axis.indexOf(coordinate);
    if(faceIndex>=0)faceCell=faceIndex===0?0:faceIndex-1;
  }
  const f32=value=>Math.fround(value);
  const addTriangle=(a,b,c)=>{
    const ax=f32(a[0]),ay=f32(a[1]),az=f32(a[2]),bx=f32(b[0]),by=f32(b[1]),bz=f32(b[2]),cx=f32(c[0]),cy=f32(c[1]),cz=f32(c[2]);
    const abx=bx-ax,aby=by-ay,abz=bz-az,acx=cx-ax,acy=cy-ay,acz=cz-az;
    const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
    if(nx===0&&ny===0&&nz===0)return;
    positions.push(ax,ay,az,bx,by,bz,cx,cy,cz);
  };
  const majorAxis=nonzeroAxes.reduce((best,axis)=>Math.abs(normal[axis])>Math.abs(normal[best])?axis:best,nonzeroAxes[0]);
  const otherAxes=[0,1,2].filter(axis=>axis!==majorAxis),majorValues=axes[majorAxis],majorStep=majorValues[1]-majorValues[0];
  const makeCell=(majorIndex,firstIndex,secondIndex)=>{
    const cell=[];cell[majorAxis]=majorIndex;cell[otherAxes[0]]=firstIndex;cell[otherAxes[1]]=secondIndex;
    const [ix,iy,iz]=cell;if(faceCell>=0&&cell[faceAxis]!==faceCell)return;
    const low=[xs[ix],ys[iy],zs[iz]],high=[xs[ix+1],ys[iy+1],zs[iz+1]];
    let minimum=0,maximum=0;
    for(let axis=0;axis<3;axis+=1){const first=normal[axis]*low[axis],second=normal[axis]*high[axis];minimum+=Math.min(first,second);maximum+=Math.max(first,second)}
    if(offset<minimum||offset>maximum)return;
    const corners=CUBE_CORNERS.map(([dx,dy,dz])=>{
      const coordinates=[ix+dx,iy+dy,iz+dz],position=[xs[coordinates[0]],ys[coordinates[1]],zs[coordinates[2]]],id=(coordinates[0]*dimensions[1]+coordinates[1])*dimensions[2]+coordinates[2];
      return{position,id,distance:vectorDot(normal,position)-offset};
    });
    const points=new Map();
    const addPoint=point=>points.set(point.join(','),point);
    for(const [a,b] of CUBE_EDGES){
      const first=corners[a],second=corners[b];
      if(first.distance===0)addPoint(first.position);
      if(second.distance===0)addPoint(second.position);
      if(first.distance*second.distance<0){
        const [a,b]=first.id<second.id?[first,second]:[second,first],fraction=a.distance/(a.distance-b.distance);
        addPoint(a.position.map((value,axis)=>value+(b.position[axis]-value)*fraction));
      }
    }
    const polygon=[...points.values()];if(polygon.length<3)return;
    const center=polygon.reduce((sum,point)=>sum.map((value,axis)=>value+point[axis]/polygon.length),[0,0,0]);
    const normalLength=Math.hypot(...normal),unit=normal.map(value=>value/normalLength);
    let helperAxis=0;if(Math.abs(unit[1])<Math.abs(unit[helperAxis]))helperAxis=1;if(Math.abs(unit[2])<Math.abs(unit[helperAxis]))helperAxis=2;
    const helper=[0,0,0];helper[helperAxis]=1;
    const firstBasis=cross(unit,helper),basisLength=Math.hypot(...firstBasis),u=firstBasis.map(value=>value/basisLength),v=cross(unit,u);
    const angle=point=>Math.atan2(vectorDot(point.map((value,axis)=>value-center[axis]),v),vectorDot(point.map((value,axis)=>value-center[axis]),u));
    polygon.sort((a,b)=>angle(a)-angle(b));
    for(let index=1;index<polygon.length-1;index+=1)addTriangle(polygon[0],polygon[index],polygon[index+1]);
  };
  // For each cell in the two axes perpendicular to the largest normal
  // component, the plane can cross only a few cells along the major axis.
  // This keeps work proportional to plane area instead of planes × volume.
  for(let firstIndex=0;firstIndex<dimensions[otherAxes[0]]-1;firstIndex+=1)for(let secondIndex=0;secondIndex<dimensions[otherAxes[1]]-1;secondIndex+=1){
    const firstAxis=otherAxes[0],secondAxis=otherAxes[1],firstValues=[axes[firstAxis][firstIndex],axes[firstAxis][firstIndex+1]],secondValues=[axes[secondAxis][secondIndex],axes[secondAxis][secondIndex+1]],majorCoordinates=[];
    for(const firstValue of firstValues)for(const secondValue of secondValues)majorCoordinates.push((offset-normal[firstAxis]*firstValue-normal[secondAxis]*secondValue)/normal[majorAxis]);
    const minCoordinate=Math.min(...majorCoordinates),maxCoordinate=Math.max(...majorCoordinates);
    if(maxCoordinate<majorValues[0]||minCoordinate>majorValues.at(-1))continue;
    const firstMajor=Math.max(0,Math.floor((minCoordinate-majorValues[0])/majorStep)-1),lastMajor=Math.min(dimensions[majorAxis]-2,Math.floor((maxCoordinate-majorValues[0])/majorStep)+1);
    for(let majorIndex=firstMajor;majorIndex<=lastMajor;majorIndex+=1)makeCell(majorIndex,firstIndex,secondIndex);
  }
  return new Float32Array(positions);
}

// At an exact extremum, a constant term plus one spatial cosine has a plane
// family as its complete level set. Other fields and non-extremal levels keep
// using the sampled tetrahedral extractor below.
function exactTangentPlanePositions({set,equation,params,time,level,grid}){
  const configured=params.terms?.length===equation.terms.length?params.terms:equation.terms.map(({vector})=>({vector,weight:1,phase:0}));
  if(configured.length!==2||!Number.isFinite(params.amplitude)||params.amplitude===0||!Number.isFinite(params.k)||params.k===0||!Number.isFinite(params.phase)||!Number.isFinite(time)||!Number.isFinite(params.parameter)||!Number.isFinite(level))return null;
  const constantIndex=configured.findIndex(term=>Array.isArray(term.vector)&&term.vector.length===3&&term.vector.every(value=>value===0));
  if(constantIndex<0)return null;
  const spatialIndex=1-constantIndex,constant=configured[constantIndex],spatial=configured[spatialIndex];
  if(!Array.isArray(spatial.vector)||spatial.vector.length!==3||!spatial.vector.every(Number.isFinite)||spatial.vector.every(value=>value===0))return null;
  const constantWeight=constant.weight??1,spatialWeight=spatial.weight??1;
  const constantOffset=constant.phase??0,spatialOffset=spatial.phase??0;
  if(!Number.isFinite(constantWeight)||!Number.isFinite(spatialWeight)||spatialWeight===0||!Number.isFinite(constantOffset)||!Number.isFinite(spatialOffset))return null;
  const normalization=Math.abs(constantWeight)+Math.abs(spatialWeight);if(normalization===0)return null;
  const constantPhase=params.k*0-set.omega(0,params.parameter)*time+params.phase+constantOffset;
  const spatialPhase=params.k*0-set.omega(params.k*Math.hypot(...spatial.vector),params.parameter)*time+params.phase+spatialOffset;
  const q=(level*normalization-constantWeight*Math.cos(constantPhase))/spatialWeight;
  // Strict equality is deliberate: near-but-outside levels stay with the
  // sampled path. A mathematically exact extremum rounded one ULP away can
  // therefore miss this rescue; loosening this test could invent a sheet.
  if(q!==1&&q!==-1)return null;
  const target=q===1?0:Math.PI,period=2*Math.PI,normal=spatial.vector;
  const projection=3*(Math.abs(normal[0])+Math.abs(normal[1])+Math.abs(normal[2]));
  const m0=(params.k*(-projection)+spatialPhase-target)/period,m1=(params.k*projection+spatialPhase-target)/period;
  const first=Math.ceil(Math.min(m0,m1)),last=Math.floor(Math.max(m0,m1));
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||last-first+1>MAX_ANALYTIC_TANGENT_PLANES)return null;
  const positions=[];
  for(let m=first;m<=last;m+=1){
    const offset=(target-spatialPhase+period*m)/params.k;
    const clipped=clipTangentPlaneToGrid(grid,normal,offset);
    for(const value of clipped)positions.push(value);
  }
  return new Float32Array(positions);
}

export function buildFieldGrid({setId,equationIndex,params,time,n,levels,tubular,revision}){
  const set=sets.find(item=>item.id===setId),equation=equations[equationIndex];
  if(!set||!equation)throw new Error('Selected field is unavailable.');
  if(![13,19,25,31,37].includes(n))throw new Error('Grid resolution must be one of the offered values, up to 37 points per axis.');
  const axis=Array.from({length:n},(_,index)=>-3+6*index/(n-1));
  const cells=axis.map(x=>axis.map(y=>axis.map(z=>({value:sample(set,equation,params,x,y,z,time),row:null}))));
  const grid={axes:[axis,axis,axis],cells,world:(coordinates,index)=>coordinates[index]},result=[];
  let totalTubeEdges=0;
  for(const [levelIndex,level] of levels.entries())try{
    const tangentPositions=exactTangentPlanePositions({set,equation,params,time,level,grid});
    if(tangentPositions?.length===0)continue;
    const positions=tangentPositions??extractIsosurface(grid,level*params.amplitude).positions;
    let segments=new Float32Array();
    if(tubular)try{
      // The 37³ input cap bounds the one extracted level; edge collection stops at budget + 1.
      segments=uniqueTriangleSegmentPositions({getAttribute:()=>({count:positions.length/3,getX:index=>positions[index*3],getY:index=>positions[index*3+1],getZ:index=>positions[index*3+2]}),getIndex:()=>null},{maxEdges:TUBE_EDGE_BUDGET-totalTubeEdges});
    }catch(error){if(error.code==='TUBE_EDGE_LIMIT')return{revision,time,limitExceeded:true,edgeCount:totalTubeEdges+error.edgeCount,levels:[]};throw error}
    totalTubeEdges+=segments.length/6;
    result.push({levelIndex,level,positions,segments});
  }catch(error){if(!String(error.message).startsWith('No scalar grid surface'))throw error}
  return{revision,time,levels:result};
}

if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope)self.addEventListener('message',event=>{
  const request=event.data;
  try{
    const result=buildFieldGrid(request),transfer=result.levels.flatMap(level=>[level.positions.buffer,level.segments.buffer]);
    self.postMessage(result,transfer);
  }catch(error){self.postMessage({revision:request.revision,time:request.time,error:String(error.message??error)})}
});
