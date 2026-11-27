import { mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [source, output = 'public/scans'] = process.argv.slice(2);
if (!source) throw new Error('Uso: node scripts/convert-dalia-full.mjs dalia_MOCO.ply [salida]');

const input = await open(source);
try {
  const headerBuffer = Buffer.alloc(8192);
  const { bytesRead } = await input.read(headerBuffer, 0, headerBuffer.length, 0);
  const match = /end_header\r?\n/.exec(headerBuffer.toString('ascii', 0, bytesRead));
  if (!match) throw new Error('Falta el encabezado PLY.');
  const dataOffset = match.index + match[0].length;
  const header = headerBuffer.toString('ascii', 0, match.index);
  if (!/^format binary_big_endian 1\.0\r?$/m.test(header)) {
    throw new Error('Se esperaba un PLY binario big-endian de Houdini.');
  }
  const count = Number(/^element vertex (\d+)\r?$/m.exec(header)?.[1]);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Conteo de vértices inválido.');
  const fields = new Map();
  let recordSize = 0;
  for (const [, type, name] of header.matchAll(/^property (\w+) (\w+)\r?$/gm)) {
    if (type !== 'float' && type !== 'uchar') throw new Error(`Tipo PLY no admitido: ${type}`);
    fields.set(name, { offset: recordSize, type });
    recordSize += type === 'float' ? 4 : 1;
  }
  if ((await input.stat()).size !== dataOffset + count * recordSize) {
    throw new Error('El tamaño del PLY no coincide con su encabezado.');
  }
  const offsets = (names, type) => names.map((name) => {
    const field = fields.get(name);
    if (field?.type !== type) throw new Error(`Campo PLY inválido: ${name}`);
    return field.offset;
  });
  const position = offsets(['x', 'y', 'z'], 'float');
  const scale = offsets(['scale1', 'scale2', 'scale3'], 'float');
  const rgb = offsets(['red', 'green', 'blue'], 'uchar');
  const rotation = offsets(['orient4', 'orient1', 'orient2', 'orient3'], 'float');
  const [alpha] = offsets(['GS_Alpha'], 'float');

  const splats = Buffer.alloc(count * 32);
  const points = Buffer.alloc(count * 16);
  const batch = Buffer.alloc(16384 * recordSize);
  for (let start = 0; start < count; start += 16384) {
    const length = Math.min(16384, count - start) * recordSize;
    let filled = 0;
    while (filled < length) {
      const read = await input.read(batch, filled, length - filled, dataOffset + start * recordSize + filled);
      if (!read.bytesRead) throw new Error('El PLY terminó antes del último vértice.');
      filled += read.bytesRead;
    }
    for (let row = 0; row < length / recordSize; row++) {
      const sourceOffset = row * recordSize;
      const splat = (start + row) * 32;
      const point = (start + row) * 16;
      for (let axis = 0; axis < 3; axis++) {
        const coordinate = batch.readFloatBE(sourceOffset + position[axis]);
        splats.writeFloatLE(coordinate, splat + axis * 4);
        points.writeFloatLE(coordinate, point + axis * 4);
        splats.writeFloatLE(batch.readFloatBE(sourceOffset + scale[axis]), splat + 12 + axis * 4);
        splats[splat + 24 + axis] = points[point + 12 + axis] = batch[sourceOffset + rgb[axis]];
      }
      const a = Math.max(0, Math.min(255, Math.round(batch.readFloatBE(sourceOffset + alpha) * 255)));
      splats[splat + 27] = points[point + 15] = a;
      const q = rotation.map((offset) => batch.readFloatBE(sourceOffset + offset));
      const norm = Math.hypot(...q);
      if (!Number.isFinite(norm) || norm === 0) throw new Error(`Rotación inválida en el vértice ${start + row}`);
      for (let k = 0; k < 4; k++) {
        splats[splat + 28 + k] = Math.max(0, Math.min(255, Math.round(128 + 128 * q[k] / norm)));
      }
    }
  }
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'dalia-moco-full.splat'), splats);
  await writeFile(join(output, 'dalia-moco-full.points.bin'), points);
  console.log(`${count} splats y puntos exportados.`);
} finally {
  await input.close();
}
