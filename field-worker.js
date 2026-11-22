import {sets,equations,sample} from './fields.js';
import {extractIsosurface} from './lib/three-viz/plotters/shared/isosurface.js';
import {uniqueTriangleSegmentPositions} from './lib/three-viz/plotters/shared/wireframe.js';

export const TUBE_EDGE_BUDGET=40000;
export function buildFieldGrid({setId,equationIndex,params,time,n,levels,tubular,revision}){
  const set=sets.find(item=>item.id===setId),equation=equations[equationIndex];
  if(!set||!equation)throw new Error('Selected field is unavailable.');
  if(![13,19,25,31,37].includes(n))throw new Error('Grid resolution must be one of the offered values, up to 37 points per axis.');
  const axis=Array.from({length:n},(_,index)=>-3+6*index/(n-1));
  const cells=axis.map(x=>axis.map(y=>axis.map(z=>({value:sample(set,equation,params,x,y,z,time),row:null}))));
  const grid={axes:[axis,axis,axis],cells,world:(coordinates,index)=>coordinates[index]},result=[];
  let totalTubeEdges=0;
  for(const [levelIndex,level] of levels.entries())try{
    const surface=extractIsosurface(grid,level*params.amplitude),positions=surface.positions;
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
