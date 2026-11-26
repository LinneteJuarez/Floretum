const POINT_BYTES = 16;
const SECTOR_COUNT = 72;
export const DURATION = 16;
export const PENTATONIC_NOTES = [60, 62, 64, 67, 69, 72];

export function colorBrightness(red, green, blue) {
  return 0.21 * red + 0.72 * green + 0.07 * blue;
}

//lectura del archivo de puntos escaneo
export async function loadPointCloud(specimen, signal) {
  const url = `${import.meta.env.BASE_URL}scans/${specimen.pointsFile}`;
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`No se pudo cargar ${specimen.pointsFile}`);
  }

  const buffer = await response.arrayBuffer();

  if (buffer.byteLength === 0 || buffer.byteLength % POINT_BYTES !== 0) {
    throw new Error('El archivo no contiene registros completos de 16 bytes.');
  }

  return new DataView(buffer);
}

//sonificación de los puntos escaneo
// Se divide el espacio en sectores y se resume la geometría y el color de cada uno.
//modificar radio (nota)para que suene mas agudo o mas grave dependiendo de la distancia del centro
//modificar concentracion (intensidad) de puntos para que suene mas fuerte o mas debil dependiendo de la concentracion
//modificar angulo (pan) para que suene mas a la derecha o mas a la izquierda dependiendo de la direccion del punto
export function buildSoundEvents(points, center) {
    const [centerX, , centerZ] = center;
    const fullTurn = 2 * Math.PI;
    const pointCount = points.byteLength / POINT_BYTES;
    const secondsPerSector = DURATION / SECTOR_COUNT;
    const sectors = Array.from({ length: SECTOR_COUNT }, () => []);
    const brightnessSums = new Float64Array(SECTOR_COUNT);
    let maxRadius = 0.5;
  
    for (let offset = 0; offset < points.byteLength; offset += POINT_BYTES) {
      const x = points.getFloat32(offset, true) - centerX;
      const z = points.getFloat32(offset + 8, true) - centerZ;
      const radius = Math.hypot(x, z);
      const angle = (Math.atan2(z, x) + fullTurn) % fullTurn;
      const index = Math.floor((angle / fullTurn) * SECTOR_COUNT);
  
      sectors[index].push(radius);
      brightnessSums[index] += colorBrightness(
        points.getUint8(offset + 12),
        points.getUint8(offset + 13),
        points.getUint8(offset + 14),
      ) / 255;
      maxRadius = Math.max(maxRadius, radius);
    }
  
    return sectors.flatMap((radii, index) => {
      if (radii.length === 0) return [];
  
      radii.sort((a, b) => a - b);
      const medianRadius = radii[Math.floor(radii.length / 2)];
      const normalizedRadius = medianRadius / (maxRadius || 1);
      const noteIndex = Math.round(normalizedRadius * (PENTATONIC_NOTES.length - 1));
  
      const fraction = radii.length / pointCount;
      const velocity = 0.15 + 0.75 * Math.min(1, Math.sqrt(fraction / 0.05));
      const angle = ((index + 0.45) / SECTOR_COUNT) * fullTurn;
  
      return [{
        time: index * secondsPerSector,
        midi: PENTATONIC_NOTES[noteIndex],
        duration: secondsPerSector * 0.75,
        velocity,
        pan: 0.75 * Math.sin(angle),
        points: radii.length,
        brightness: brightnessSums[index] / radii.length,
      }];
    });
  }
