import { createCarPaintMaterial } from './materials.js?v=car-paint-20261010a';
/** Remove coincident or reversed duplicate segments while preserving every unique wire edge. */
export function deduplicateSegmentPositions(positionAttribute) {
  const points = [];
  const seen = new Set();
  const pointKey = (index) => `${positionAttribute.getX(index)},${positionAttribute.getY(index)},${positionAttribute.getZ(index)}`;
  for (let index = 0; index + 1 < positionAttribute.count; index += 2) {
    const firstKey = pointKey(index), secondKey = pointKey(index + 1);
    if (firstKey === secondKey) continue;
    const edgeKey = firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
    if (seen.has(edgeKey)) continue;
    seen.add(edgeKey);
    points.push(
      positionAttribute.getX(index), positionAttribute.getY(index), positionAttribute.getZ(index),
      positionAttribute.getX(index + 1), positionAttribute.getY(index + 1), positionAttribute.getZ(index + 1),
    );
  }
  return new Float32Array(points);
}
/** Extract unique triangle edges directly, avoiding an intermediate wireframe geometry. */
export function uniqueTriangleSegmentPositions(geometry, { maxEdges = Number.POSITIVE_INFINITY } = {}) {
  const position = geometry.getAttribute('position'), index = geometry.getIndex?.();
  if (!position) return new Float32Array();
  const vertexCount = index?.count ?? position.count, points = [], seen = new Set();
  const pointKey = (vertex) => `${position.getX(vertex)},${position.getY(vertex)},${position.getZ(vertex)}`;
  const pushEdge = (start, end) => {
    const firstKey = pointKey(start), secondKey = pointKey(end);
    if (firstKey === secondKey) return;
    const edgeKey = firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
    if (seen.has(edgeKey)) return;
    seen.add(edgeKey);
    if (seen.size > maxEdges) {
      const error = new RangeError(`Unique triangle edges exceed the ${maxEdges}-edge limit.`);
      error.code = "TUBE_EDGE_LIMIT";
      error.edgeCount = seen.size;
      throw error;
    }
    points.push(position.getX(start),position.getY(start),position.getZ(start),position.getX(end),position.getY(end),position.getZ(end));
  };
  for (let offset=0;offset+2<vertexCount;offset+=3) {
    const a=index?index.getX(offset):offset,b=index?index.getX(offset+1):offset+1,c=index?index.getX(offset+2):offset+2;
    pushEdge(a,b);pushEdge(b,c);pushEdge(c,a);
  }
  return new Float32Array(points);
}
/** Build a disposable line or tubular wireframe layer around an existing Three.js geometry. */
export function createWireframe(THREE, geometry, { color = 0xd6f4ff, opacity = 0.64, threshold = 1, full = false, tubeRadius = 0, tubeSegments = null } = {}) {
  const tubular = Number.isFinite(tubeRadius) && tubeRadius > 0;
  const directTube = tubular && full;
  const WireGeometry = full ? THREE.WireframeGeometry : THREE.EdgesGeometry;
  if (!directTube && typeof WireGeometry !== "function") throw new Error("Wireframe display needs Three.js edge geometry support.");
  const wireGeometry = directTube ? null : (full ? new WireGeometry(geometry) : new WireGeometry(geometry, threshold));
  if (tubular) {
    if (typeof THREE.CylinderGeometry !== "function" || (typeof THREE.MeshPhysicalMaterial !== "function" && typeof THREE.MeshStandardMaterial !== "function") || typeof THREE.InstancedMesh !== "function" || typeof THREE.Matrix4 !== "function" || typeof THREE.Quaternion !== "function" || typeof THREE.Vector3 !== "function") {
      wireGeometry?.dispose();
      throw new Error("Tubular wireframes need Three.js cylinder instancing support.");
    }
    let tubeGeometry, material;
    try {
      const positions = tubeSegments ?? (directTube ? uniqueTriangleSegmentPositions(geometry) : deduplicateSegmentPositions(wireGeometry.getAttribute("position")));
      const count = Math.floor(positions.length / 6);
      tubeGeometry = new THREE.CylinderGeometry(tubeRadius, tubeRadius, 1, 12, 1);
      material = createCarPaintMaterial(THREE, color);
      const object = new THREE.InstancedMesh(tubeGeometry, material, count);
      const matrix = new THREE.Matrix4();
      const midpoint = new THREE.Vector3();
      const direction = new THREE.Vector3();
      const scale = new THREE.Vector3(1, 1, 1);
      const quaternion = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      for (let index = 0; index < count; index += 1) {
        const first = index * 2;
        const start = new THREE.Vector3(positions[first * 3], positions[first * 3 + 1], positions[first * 3 + 2]);
        const end = new THREE.Vector3(positions[(first + 1) * 3], positions[(first + 1) * 3 + 1], positions[(first + 1) * 3 + 2]);
        direction.subVectors(end, start);
        const length = direction.length();
        if (length <= 1e-9) { scale.set(0, 0, 0); }
        else {
          midpoint.addVectors(start, end).multiplyScalar(0.5);
          quaternion.setFromUnitVectors(up, direction.normalize());
          scale.set(1, length, 1);
        }
        matrix.compose(length > 1e-9 ? midpoint : start, quaternion, scale);
        object.setMatrixAt(index, matrix);
      }
      object.instanceMatrix.needsUpdate = true;
      object.name = "tubular-wireframe";
      wireGeometry?.dispose();
      return { object, geometry: tubeGeometry, material };
    } catch (error) {
      tubeGeometry?.dispose();
      material?.dispose();
      wireGeometry?.dispose();
      throw error;
    }
  }
  if (typeof THREE.LineBasicMaterial !== "function" || typeof THREE.LineSegments !== "function") {
    wireGeometry.dispose();
    throw new Error("Wireframe display needs Three.js line classes.");
  }
  let material;
  try {
    material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    const object = new THREE.LineSegments(wireGeometry, material);
    return { object, geometry: wireGeometry, material };
  } catch (error) {
    material?.dispose();
    wireGeometry.dispose();
    throw error;
  }
}
