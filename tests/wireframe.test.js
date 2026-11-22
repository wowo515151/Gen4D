import test from 'node:test';
import assert from 'node:assert/strict';
import {createWireframe,deduplicateSegmentPositions,uniqueTriangleSegmentPositions} from '../lib/three-viz/plotters/shared/wireframe.js';

test('tube edge preparation removes repeated and reversed segments but keeps distinct edges',()=>{
  const points=[
    0,0,0, 1,0,0,
    1,0,0, 0,0,0,
    1,0,0, 1,1,0,
    0,0,0, 0,0,0,
    0,0,0, 0,1,0,
  ];
  const attribute={count:points.length/3,getX:index=>points[index*3],getY:index=>points[index*3+1],getZ:index=>points[index*3+2]};
  const unique=deduplicateSegmentPositions(attribute);
  assert.equal(unique.length/6,3);
  assert.deepEqual([...unique],[0,0,0,1,0,0,1,0,0,1,1,0,0,0,0,0,1,0]);
});

test('direct tubular path preserves all unique indexed and non-indexed triangle edges and disposes returned resources',()=>{
  const vertices=[0,0,0,1,0,0,0,1,0,0,0,1];
  const position={count:4,getX:index=>vertices[index*3],getY:index=>vertices[index*3+1],getZ:index=>vertices[index*3+2]};
  const indices=[0,1,2,0,2,3,0,3,1,1,3,2,0,1,2];
  const geometry={getAttribute:()=>position,getIndex:()=>({count:indices.length,getX:index=>indices[index]})};
  const expected=uniqueTriangleSegmentPositions(geometry);
  assert.equal(expected.length/6,6);

  const trianglePoints=[];
  for(let offset=0;offset+2<indices.length;offset+=3)for(const vertex of [indices[offset],indices[offset+1],indices[offset+2]])trianglePoints.push(...vertices.slice(vertex*3,vertex*3+3));
  const nonIndexed={getAttribute:()=>({count:trianglePoints.length/3,getX:index=>trianglePoints[index*3],getY:index=>trianglePoints[index*3+1],getZ:index=>trianglePoints[index*3+2]}),getIndex:()=>null};
  assert.equal(uniqueTriangleSegmentPositions(nonIndexed).length/6,6);

  let wireframeCalls=0;
  class CylinderGeometry {constructor(){this.disposed=0}dispose(){this.disposed++}}
  class Material {constructor(options){this.options=options;this.disposed=0}dispose(){this.disposed++}}
  class Vector3 {
    constructor(x=0,y=0,z=0){this.set(x,y,z)}
    set(x,y,z){Object.assign(this,{x,y,z});return this}
    subVectors(a,b){return this.set(a.x-b.x,a.y-b.y,a.z-b.z)}
    length(){return Math.hypot(this.x,this.y,this.z)}
    addVectors(a,b){return this.set(a.x+b.x,a.y+b.y,a.z+b.z)}
    multiplyScalar(value){return this.set(this.x*value,this.y*value,this.z*value)}
    normalize(){const length=this.length()||1;return this.set(this.x/length,this.y/length,this.z/length)}
  }
  class Matrix4 {compose(position,quaternion,scale){Object.assign(this,{position:{...position},quaternion,scale:{...scale}});return this}}
  class Quaternion {setFromUnitVectors(from,to){this.from=from;this.to=to;return this}}
  class InstancedMesh {constructor(geometry,material,count){Object.assign(this,{geometry,material,count,matrices:[],instanceMatrix:{}})}setMatrixAt(index,matrix){this.matrices[index]=matrix}}
  class WireframeGeometry {constructor(){wireframeCalls++;throw new Error('unexpected intermediate wireframe allocation')}}
  const THREE={CylinderGeometry,MeshPhysicalMaterial:Material,InstancedMesh,Matrix4,Quaternion,Vector3,WireframeGeometry};
  const wire=createWireframe(THREE,geometry,{full:true,tubeRadius:0.012});
  assert.equal(wireframeCalls,0);
  assert.equal(wire.object.count,6);
  wire.geometry.dispose();wire.material.dispose();
  assert.equal(wire.geometry.disposed,1);
  assert.equal(wire.material.disposed,1);
});
