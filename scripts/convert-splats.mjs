import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const sourceDir = path.resolve('dist/scans-final');
const outputDir = path.resolve('public/scans');
const minimumOpacity = 8;
const maximumScale = 0.0045;
const cropByFile = {
  'scan-01.ply': (splat) => splat[1] <= -0.04,
  'scan-02.ply': (splat) => splat[1] <= -0.08 &&
    splat[0] >= -0.13 && splat[0] <= 0.06 &&
    splat[2] >= -0.02 && splat[2] <= 0.15,
};
await fs.mkdir(outputDir, { recursive: true });

for (const [sourceName, outputName] of [
  ['scan-01.ply', 'scan-01.ksplat'],
  ['scan-02.ply', 'scan-02.ksplat'],
]) {
  const bytes = await fs.readFile(path.join(sourceDir, sourceName));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const splats = GaussianSplats3D.PlyParser.parseToUncompressedSplatArray(arrayBuffer, 0);
  const before = splats.splatCount;

  // Preserve every flower Gaussian and its source attributes. The spatial
  // windows exclude the pot, foliage, floor, and distant scan haze.
  splats.splats = splats.splats.filter((splat) =>
    splat[13] >= minimumOpacity &&
    Math.max(splat[3], splat[4], splat[5]) <= maximumScale &&
    cropByFile[sourceName](splat));
  splats.splatCount = splats.splats.length;

  const pointCloud = Buffer.alloc(splats.splatCount * 16);
  splats.splats.forEach((splat, index) => {
    const offset = index * 16;
    pointCloud.writeFloatLE(splat[0], offset);
    pointCloud.writeFloatLE(splat[1], offset + 4);
    pointCloud.writeFloatLE(splat[2], offset + 8);
    pointCloud[offset + 12] = splat[10];
    pointCloud[offset + 13] = splat[11];
    pointCloud[offset + 14] = splat[12];
    pointCloud[offset + 15] = splat[13];
  });
  const pointTarget = path.join(outputDir, outputName.replace('.ksplat', '.points.bin'));
  await fs.writeFile(pointTarget, pointCloud);

  const generator = GaussianSplats3D.SplatBufferGenerator.getStandardGenerator(
    minimumOpacity,
    0,
    0,
    new THREE.Vector3(0, 0, 0),
    5,
    256,
  );
  const splatBuffer = generator.generateFromUncompressedSplatArray(splats);
  const target = path.join(outputDir, outputName);
  await fs.writeFile(target, Buffer.from(splatBuffer.bufferData));
  const stat = await fs.stat(target);
  console.log(`${sourceName}: ${before.toLocaleString()} → ${splats.splatCount.toLocaleString()} Gaussian splats de alta calidad, ${stat.size.toLocaleString()} bytes`);
}
