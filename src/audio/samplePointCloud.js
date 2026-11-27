import { Vector3 } from 'three';

const RECORD_BYTES = 16;
const SAMPLE_RADIUS = 80;
const MAX_POINTER_POINTS = 350_000;

export function samplePointCloud(points, camera, bounds, pointer) {
  const x = pointer.x - bounds.left;
  const y = pointer.y - bounds.top;
  if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) return null;

  const candidates = [];
  const position = new Vector3();
  let frontDepth = Infinity;
  camera.updateMatrixWorld();

  const stride = RECORD_BYTES * Math.max(1, Math.ceil(points.byteLength / RECORD_BYTES / MAX_POINTER_POINTS));
  for (let offset = 0; offset < points.byteLength; offset += stride) {
    position.set(
      points.getFloat32(offset, true),
      points.getFloat32(offset + 4, true),
      points.getFloat32(offset + 8, true),
    ).applyMatrix4(camera.matrixWorldInverse);

    const depth = -position.z;
    if (depth < camera.near || depth > camera.far) continue;

    position.applyMatrix4(camera.projectionMatrix);
    const dx = (position.x + 1) * bounds.width / 2 - x;
    const dy = (1 - position.y) * bounds.height / 2 - y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > SAMPLE_RADIUS ** 2) continue;

    candidates.push({ offset, depth, dx, dy });
    frontDepth = Math.min(frontDepth, depth);
  }

  const depthLimit = frontDepth * 1.04;
  let count = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  let sumX = 0;
  let sumY = 0;
  let sumSquared = 0;

  for (const { offset, depth, dx, dy } of candidates) {
    if (depth > depthLimit) continue;
    count += 1;
    red += points.getUint8(offset + 12);
    green += points.getUint8(offset + 13);
    blue += points.getUint8(offset + 14);
    sumX += dx;
    sumY += dy;
    sumSquared += dx * dx + dy * dy;
  }

  if (count < 2) return null;

  return {
    count,
    red: red / (count * 255),
    green: green / (count * 255),
    blue: blue / (count * 255),
    spread: Math.sqrt(Math.max(0, sumSquared / count - (sumX / count) ** 2 - (sumY / count) ** 2)) / SAMPLE_RADIUS,
    depth: frontDepth,
    pan: (x / bounds.width) * 2 - 1,
  };
}
