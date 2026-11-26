const POINT_BYTES = 16;
const SECTOR_COUNT = 48;
const DURATION = 16;
const PENTATONIC_NOTES = [60, 62, 64, 67, 69, 72];

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
//se divide el espacio en 48 sectores y se asigna una nota a cada sector
//modificar radio (nota)para que suene mas agudo o mas grave dependiendo de la distancia del centro
//modificar concentracion (intensidad) de puntos para que suene mas fuerte o mas debil dependiendo de la concentracion
//modificar angulo (pan) para que suene mas a la derecha o mas a la izquierda dependiendo de la direccion del punto
export function buildSoundEvents(points, center) {
    const [centerX, , centerZ] = center;
    const fullTurn = 2 * Math.PI;
    const pointCount = points.byteLength / POINT_BYTES;
    const secondsPerSector = DURATION / SECTOR_COUNT;
    const sectors = Array.from({ length: SECTOR_COUNT }, () => []);
    let maxRadius = 0;
  
    for (let offset = 0; offset < points.byteLength; offset += POINT_BYTES) {
      const x = points.getFloat32(offset, true) - centerX;
      const z = points.getFloat32(offset + 8, true) - centerZ;
      const radius = Math.hypot(x, z);
      const angle = (Math.atan2(z, x) + fullTurn) % fullTurn;
      const index = Math.floor((angle / fullTurn) * SECTOR_COUNT);
  
      sectors[index].push(radius);
      maxRadius = Math.max(maxRadius, radius);
    }
  
    return sectors.flatMap((radii, index) => {
      if (radii.length === 0) return [];
  
      radii.sort((a, b) => a - b);
      const medianRadius = radii[Math.floor(radii.length / 2)];
      const normalizedRadius = medianRadius / (maxRadius || 1);
      const noteIndex = Math.round(normalizedRadius * (PENTATONIC_NOTES.length - 1));
  
      const fraction = radii.length / pointCount;
      const velocity = 0.15 + 0.65 * Math.min(1, Math.sqrt(fraction / 0.06));
      const angle = ((index + 0.5) / SECTOR_COUNT) * fullTurn;
  
      return [{
        time: index * secondsPerSector,
        midi: PENTATONIC_NOTES[noteIndex],
        duration: secondsPerSector * 0.75,
        velocity,
        pan: 0.75 * Math.sin(angle),
        points: radii.length,
      }];
    });
  }