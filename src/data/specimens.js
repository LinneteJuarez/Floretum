// Catálogo editable de especies.
// Para agregar una flor, duplica un objeto y coloca sus archivos en public/scans/.
export const specimens = [
  {
    number: '01',
    id: 'amarilla',
    dataId: 'FLOR-DALIA-001',
    name: 'Dalia amarilla',
    scientific: 'Dahlia spp.',
    note: 'Flor amarilla',
    file: 'scan-01.ksplat',
    pointsFile: 'scan-01.points.bin',
    center: [-0.04565, -0.0768, 0.02628],
    cameraDistance: 0.22,
    botanical: {
      family: 'Asteraceae',
      color: 'Amarillo cálido',
      scan: '37,438 splats',
      description: 'Registro tridimensional de una dalia ornamental para observar su volumen, estructura y color.',
    },
  },
  {
    number: '02',
    id: 'pompon-roja',
    dataId: 'FLOR-DALIA-002',
    name: 'Dalia pompón roja',
    scientific: 'Dahlia spp.',
    note: 'Tipo pompón · Flor roja',
    file: 'scan-02.ksplat',
    pointsFile: 'scan-02.points.bin',
    center: [-0.02789, -0.12974, 0.06956],
    cameraDistance: 0.22,
    botanical: {
      family: 'Asteraceae',
      color: 'Rojo intenso',
      scan: '25,319 splats',
      description: 'Registro tridimensional de una dalia tipo pompón, conservando la densidad visual de sus pétalos.',
    },
  },
];
