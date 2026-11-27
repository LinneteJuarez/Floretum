import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const sourceDir = 'C:/Users/Win11/Downloads';
const outputDir = path.resolve('public/scans');
const minimumAlpha = 8;
const maximumScale = 0.012;
const maximumSplats = 360000;

const sources = [
  ['dalia_MOCO.ply', 'dalia-moco'],
  ['dalia_rojaAnzures.ply', 'dalia-roja-anzures'],
  ['cempasuchil.ply', 'cempasuchil'],
  ['salvia.ply', 'salvia'],
  ['nochebuena_MOCO.ply', 'nochebuena-moco'],
];

const readFloat = (view, offset) => view.getFloat32(offset, false);

async function convert(sourceName, outputName) {
  const sourcePath = path.join(sourceDir, sourceName);
  const bytes = await fs.readFile(sourcePath);
  const headerEnd = bytes.indexOf(Buffer.from('end_header\n'));
  if (headerEnd < 0) throw new Error(`No se encontró end_header en ${sourceName}`);

  const dataOffset = headerEnd + 'end_header\n'.length;
  const recordSize = 255;
  const count = Math.floor((bytes.length - dataOffset) / recordSize);
  const view = new DataView(bytes.buffer, bytes.byteOffset + dataOffset, count * recordSize);
  const candidates = [];

  for (let index = 0; index < count; index += 1) {
    const offset = index * recordSize;
    const alpha = readFloat(view, offset + 15) * 255;
    const scale = [
      readFloat(view, offset + 243),
      readFloat(view, offset + 247),
      readFloat(view, offset + 251),
    ];
    if (alpha < minimumAlpha || Math.max(...scale) > maximumScale) continue;

    candidates.push({
      x: readFloat(view, offset),
      y: readFloat(view, offset + 4),
      z: readFloat(view, offset + 8),
      color: [bytes[dataOffset + offset + 12], bytes[dataOffset + offset + 13], bytes[dataOffset + offset + 14]],
      alpha,
      scale,
      rotation: [
        readFloat(view, offset + 211),
        readFloat(view, offset + 215),
        readFloat(view, offset + 219),
        readFloat(view, offset + 223),
      ],
    });
  }

  const stride = Math.max(1, Math.ceil(candidates.length / maximumSplats));
  const selected = candidates.filter((_, index) => index % stride === 0);
  const splats = {
    splats: [],
    splatCount: 0,
    sphericalHarmonicsDegree: 0,
    getSplat(index) {
      return this.splats[index];
    },
  };
  selected.forEach((splat) => {
    splats.splats.push([
      splat.x, splat.y, splat.z,
      ...splat.scale,
      ...splat.rotation,
      ...splat.color,
      splat.alpha,
    ]);
  });
  splats.splatCount = splats.splats.length;

  const generator = GaussianSplats3D.SplatBufferGenerator.getStandardGenerator(
    minimumAlpha,
    0,
    0,
    new THREE.Vector3(0, 0, 0),
    5,
    256,
  );
  const buffer = generator.generateFromUncompressedSplatArray(splats);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `${outputName}.ksplat`), Buffer.from(buffer.bufferData));

  const pointCloud = Buffer.alloc(selected.length * 16);
  selected.forEach((splat, index) => {
    const offset = index * 15;
    pointCloud.writeFloatLE(splat.x, offset);
    pointCloud.writeFloatLE(splat.y, offset + 4);
    pointCloud.writeFloatLE(splat.z, offset + 8);
    pointCloud[offset + 12] = splat.color[0];
    pointCloud[offset + 13] = splat.color[1];
    pointCloud[offset + 14] = splat.color[2];
    pointCloud[offset + 15] = Math.round(splat.alpha);
  });
  await fs.writeFile(path.join(outputDir, `${outputName}.points.bin`), pointCloud);

  console.log(`${sourceName}: ${count.toLocaleString()} → ${selected.length.toLocaleString()} splats`);
}

for (const [sourceName, outputName] of sources) {
  await convert(sourceName, outputName);
}
