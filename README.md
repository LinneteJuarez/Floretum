# Floretum

Archivo visual de dalias construido con React, Vite, Three.js y GaussianSplats3D.

## Estructura rápida

- `src/main.jsx`: composición de la página, navegación, carga del Gaussian y comportamiento de las máscaras.
- `src/data/specimens.js`: catálogo editable de especies y sus datos botánicos.
- `src/shaders/pointCloud.js`: material GPU de la nube de puntos, tamaño de partícula y ruido animado.
- `src/style.css`: sistema visual, layout, estados, máscaras y responsive.
- `public/scans/`: archivos `.spz`, `.ksplat` y `.points.bin` usados por cada espécimen.
- `scripts/convert-splats.mjs`: convierte los `.ply` fuente en Gaussian splats y nubes de puntos.

## Editar una especie

1. Coloca el Gaussian `.ksplat` y el archivo `.points.bin` en `public/scans/`.
2. Agrega un objeto en `src/data/specimens.js`.
3. Mantén el mismo `center` para ambos archivos: se usa para alinear la nube con el Gaussian.
4. Ajusta `cameraDistance` solo si el encuadre inicial de la especie lo necesita.

## Editar el efecto de partículas

Los valores principales están al inicio de `src/shaders/pointCloud.js`:

- `POINT_CLOUD_POINT_SIZE`: reduce o aumenta el tamaño de cada punto.
- `POINT_CLOUD_RENDER_FPS`: controla la frecuencia de actualización.
- `noise * 0.0008`: controla cuánto se mueve cada partícula.
- `POINT_CLOUD_CAMERA_SCALE`: compensa la diferencia visual entre los centros de puntos y el volumen de los splats.

El ruido corre en el shader de la GPU para evitar recalcular las posiciones en React o JavaScript.

## Ejecutar

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 3002
```

Para validar una versión de producción:

```bash
npm run build
```

## Desplegar en Cloudflare Pages

- Comando de compilación `npm run build`. Directorio de salida `dist/pages`.
- Para ejecutar la conversión de los PLY y el build anterior de forma local, usa `npm run build:local`.
- Define `VITE_SCAN_BASE_URL` con la URL HTTPS del bucket R2 donde están `dalia-moco-full.spz` y `dalia-moco-full.points.bin`. El build usa el bucket `r2.dev` de prueba si omites esta variable. Para producción, configura el dominio personalizado del bucket.
- En R2, permite `GET` desde el origen exacto de Pages. Para probar el build localmente, ejecuta `npm run preview -- --mode pages --configLoader native` y permite el origen que indique Vite (normalmente `http://localhost:4173`). El servidor de desarrollo también usa R2 y requiere permitir `http://localhost:3002` si lo abres en ese origen.
- Para habilitar las consultas del asistente en Pages, define `VITE_DALIA_WEBHOOK_URL` con un webhook de producción accesible por HTTPS y que admita solicitudes desde el origen del sitio.

# Escaneo completo de DALIA_MOCO

Genera los archivos que usa el visor Spark desde el PLY binario de Houdini:

```powershell
node scripts/convert-dalia-full.mjs 'D:/CC/TESIS/Gaussians/cleanGaussians/dalia_MOCO.ply'
npm run dev
```

La conversión guarda los 3,208,929 splats en `public/scans/dalia-moco-full.spz` (formato comprimido compatible con Spark) y los puntos para el audio y los rayos X en `public/scans/dalia-moco-full.points.bin`. Para regenerar el SPZ desde el archivo completo original:

```powershell
npm run convert:spz
```
