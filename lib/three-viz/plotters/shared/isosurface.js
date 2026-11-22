const CUBE_CORNERS = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
const TETRAHEDRA = [[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
const TETRA_EDGES = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];

export function extractIsosurface(grid, threshold) {
  const [xs,ys,zs]=grid.axes;
  const positions=[];
  const triangleRows=[];
  const exactFaceKeys=new Set();
  const interpolate=(a,b)=>{
    const fraction=a.value===b.value?0:(threshold-a.value)/(b.value-a.value);
    return [
      a.position[0]+(b.position[0]-a.position[0])*fraction,
      a.position[1]+(b.position[1]-a.position[1])*fraction,
      a.position[2]+(b.position[2]-a.position[2])*fraction,
    ];
  };
  const emit=(a,b,c,row)=>{
    // Match the Float32 geometry that callers render, so near-level vertices
    // that collapse during conversion cannot leave zero-area output triangles.
    const ax=Math.fround(a[0]),ay=Math.fround(a[1]),az=Math.fround(a[2]);
    const bx=Math.fround(b[0]),by=Math.fround(b[1]),bz=Math.fround(b[2]);
    const cx=Math.fround(c[0]),cy=Math.fround(c[1]),cz=Math.fround(c[2]);
    const abx=bx-ax,aby=by-ay,abz=bz-az,acx=cx-ax,acy=cy-ay,acz=cz-az;
    const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
    if(nx===0&&ny===0&&nz===0)return;
    positions.push(ax,ay,az,bx,by,bz,cx,cy,cz); triangleRows.push(row,row,row);
  };
  for(let ix=0;ix<xs.length-1;ix+=1) for(let iy=0;iy<ys.length-1;iy+=1) for(let iz=0;iz<zs.length-1;iz+=1){
    const corners=CUBE_CORNERS.map(([dx,dy,dz])=>{
      const x=ix+dx,y=iy+dy,z=iz+dz,cell=grid.cells[x][y][z];
      return { value:cell.value, row:cell.row, vertexId:(x*ys.length+y)*zs.length+z, position:[grid.world(xs,x),grid.world(ys,y),grid.world(zs,z)] };
    });
    const cellRow=grid.cells[ix][iy][iz].row;
    for(const tetra of TETRAHEDRA){
      const points=tetra.map(index=>corners[index]);
      const inside=[],outside=[];
      let equalCount=0,opposite=-1;
      for(let index=0;index<4;index+=1){
        const value=points[index].value;
        if(value===threshold){equalCount+=1;inside.push(index)}
        else if(value>threshold){opposite=index;inside.push(index)}
        else if(value<threshold){opposite=index;outside.push(index)}
      }
      // A tetrahedron with exactly one non-level vertex has an exact triangular
      // level face. Emit that face once across adjacent tetrahedra/cells.
      if(equalCount===4)continue;
      if(equalCount===3){
        if(opposite>=0){
          const face=points.filter((point,index)=>index!==opposite);
          const key=face.map(point=>point.vertexId).sort((a,b)=>a-b).join(',');
          if(!exactFaceKeys.has(key)){
            exactFaceKeys.add(key);
            emit(face[0].position,face[1].position,face[2].position,cellRow);
          }
        }
        continue;
      }
      if(inside.length===0||inside.length===4) continue;
      if(inside.length===1||inside.length===3){
        const pivot=inside.length===1?inside[0]:outside[0];
        const others=inside.length===1?outside:inside;
        const tri=others.map(index=>interpolate(points[pivot],points[index]));
        emit(tri[0],tri[1],tri[2],cellRow);
      } else {
        const [i0,i1]=inside,[o0,o1]=outside;
        const p0=interpolate(points[i0],points[o0]),p1=interpolate(points[i0],points[o1]);
        const p2=interpolate(points[i1],points[o1]),p3=interpolate(points[i1],points[o0]);
        emit(p0,p1,p2,cellRow); emit(p0,p2,p3,cellRow);
      }
    }
  }
  if(!positions.length) throw new Error(`No scalar grid surface crosses threshold ${String(threshold)}.`);
  return { positions:new Float32Array(positions), triangleRows, triangleCount:positions.length/9 };
}
