import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { specimens } from '../src/data/specimens.js';

const [source, output = 'public/scans/dalia-moco-full.points.bin'] = process.argv.slice(2);
if (!source) throw new Error('Uso: node scripts/convert-dalia-csv.mjs daliamoco.csv [salida]');

const { splatCount } = specimens.find(({ id }) => id === 'dalia-moco');
const recordBytes = 16;
const points = Buffer.alloc(splatCount * recordBytes);
const rows = createInterface({ input: createReadStream(source), crlfDelay: Infinity });
let line = 0;

for await (const row of rows) {
  line += 1;
  if (line === 1) {
    if (row.replace(/^\uFEFF/, '') !== 'x,y,z,r,g,b,alpha,scale_x,scale_y,scale_z') {
      throw new Error('El encabezado no corresponde al CSV de la dalia.');
    }
    continue;
  }

  const offset = (line - 2) * recordBytes;
  if (offset >= points.length) throw new Error('El CSV tiene más puntos que el escaneo.');
  const fields = row.split(',');
  const values = fields.slice(0, 7).map(Number);
  if (fields.length !== 10 || fields.slice(0, 7).some((field) => !field.trim())
    || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Punto inválido en la línea ${line}.`);
  }

  for (let axis = 0; axis < 3; axis++) points.writeFloatLE(values[axis], offset + axis * 4);
  for (let channel = 0; channel < 4; channel++) {
    points[offset + 12 + channel] = Math.round(255 * Math.max(0, Math.min(1, values[3 + channel])));
  }
}

if (line - 1 !== splatCount) throw new Error('El conteo del CSV no coincide con el escaneo.');
await writeFile(output, points);
console.log(`${splatCount} puntos exportados a ${output}.`);
