import fs from 'node:fs';

const [inputPath, outputPath] = process.argv.slice(2);
const source = fs.readFileSync(inputPath);
const headerEnd = source.indexOf(Buffer.from('end_header\n'));
const headerBytes = headerEnd + 11;
const header = source.subarray(0, headerBytes).toString('ascii');
const count = Number(header.match(/element vertex (\d+)/)?.[1]);
const stride = 15;
const points = new Array(count);
let cx = 0, cy = 0, cz = 0;
for (let i = 0; i < count; i++) {
  const o = headerBytes + i * stride;
  const point = { x: source.readFloatLE(o), y: source.readFloatLE(o + 4), z: source.readFloatLE(o + 8), o };
  points[i] = point; cx += point.x; cy += point.y; cz += point.z;
}
cx /= count; cy /= count; cz /= count;
const distances = points.map(p => Math.hypot(p.x - cx, p.y - cy, p.z - cz)).sort((a,b) => a-b);
const radius = distances[Math.floor(distances.length * 0.82)];
const kept = points.filter(p => Math.hypot(p.x - cx, p.y - cy, p.z - cz) <= radius);
const outHeader = Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${kept.length}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`, 'ascii');
const output = Buffer.allocUnsafe(outHeader.length + kept.length * stride);
outHeader.copy(output);
for (let i = 0; i < kept.length; i++) source.copy(output, outHeader.length + i * stride, kept[i].o, kept[i].o + stride);
fs.writeFileSync(outputPath, output);
console.log(`${inputPath} -> ${outputPath}: ${count} a ${kept.length} puntos`);
