import { readFile, writeFile } from 'node:fs/promises';
import { transcodeSpz } from '@sparkjsdev/spark';

const input = process.argv[2] || 'public/scans/dalia-moco-full.splat';
const output = process.argv[3] || 'public/scans/dalia-moco-full.spz';

const source = await readFile(input);
const { fileBytes, clippedCount } = await transcodeSpz({
  inputs: [{
    fileBytes: new Uint8Array(source),
    fileType: 'splat',
    pathOrUrl: input,
  }],
  maxSh: 0,
});

await writeFile(output, fileBytes);
console.log(`${input}: ${source.byteLength} bytes → ${output}: ${fileBytes.byteLength} bytes`);
if (clippedCount) console.log(`Splats recortados: ${clippedCount}`);
