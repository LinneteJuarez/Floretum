import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig, motion } from 'motion/react';
import Lenis from 'lenis';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import SpecimenAudio from './audio/SpecimenAudio';
import { specimens } from './data/specimens';
import {
  createPointCloudMaterial,
  POINT_CLOUD_CAMERA_FOV,
  POINT_CLOUD_CAMERA_SCALE,
  POINT_CLOUD_RENDER_FPS,
} from './shaders/pointCloud';
import './style.css';

// Capa de rayos X: el Gaussian permanece debajo y cada máscara recorta
// una nube de puntos a escala completa, sin volver a centrar la flor.
function PointMaskLayer({ specimen, hoverTrail, viewerRef }) {
  const layerRef = useRef(null);
  const hoverTrailRef = useRef(hoverTrail);
  hoverTrailRef.current = hoverTrail;

  const alignCanvases = () => {
    const layer = layerRef.current;
    if (!layer) return;
    const fullWidth = layer.clientWidth;
    const fullHeight = layer.clientHeight;
    const canvas = layer.querySelector('[data-point-canvas="hover"]');
    if (!canvas) return;
    const trail = hoverTrailRef.current;
    if (!trail.length) {
      canvas.style.clipPath = 'inset(100% 0 0 0)';
      canvas.style.maskImage = 'none';
      canvas.style.webkitMaskImage = 'none';
      canvas.style.opacity = '0';
      canvas.style.filter = 'none';
      return;
    }
    const recentTrail = trail.slice(-9);
    const radialMasks = recentTrail.map((point, index) => {
      const freshness = (index + 1) / recentTrail.length;
      const radius = Math.min(Math.max(fullWidth * (0.045 + freshness * 0.025), 24), 42);
      const alpha = 0.18 + freshness * 0.8;
      return `radial-gradient(circle ${radius}px at ${point.x}% ${point.y}%, rgba(0, 0, 0, ${alpha}) 0%, rgba(0, 0, 0, ${alpha * 0.82}) 46%, rgba(0, 0, 0, ${alpha * 0.38}) 72%, rgba(0, 0, 0, 0) 100%)`;
    });
    const radialMask = radialMasks.join(', ');
    canvas.style.clipPath = 'none';
    canvas.style.maskImage = radialMask;
    canvas.style.webkitMaskImage = radialMask;
    canvas.style.maskComposite = 'add';
    canvas.style.webkitMaskComposite = 'source-over';
    canvas.style.opacity = '0.96';
    canvas.style.filter = 'none';
    canvas.style.mixBlendMode = 'screen';
  };

  useEffect(() => { window.requestAnimationFrame(alignCanvases); }, [hoverTrail]);

  useEffect(() => {
    let cancelled = false;
    let frameId = null;
    let geometry = null;
    let material = null;
    let resizeObserver = null;
    const renderers = [];
    const cameras = [];
    const specimenCenter = new THREE.Vector3(...specimen.center);
    let lastCameraSnapshot = null;
    let lastRenderTime = -Infinity;

    async function loadPointCloud() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}scans/${specimen.pointsFile}`);
        if (!response.ok) throw new Error(`No se pudo abrir ${specimen.pointsFile}`);
        const bytes = await response.arrayBuffer();
        if (cancelled || !layerRef.current) return;
        const count = bytes.byteLength / 16;
        const data = new DataView(bytes);
        const positions = new Float32Array(count * 3);
        const colors = new Uint8Array(count * 3);
        for (let index = 0; index < count; index += 1) {
          const source = index * 16;
          positions[index * 3] = data.getFloat32(source, true) - specimen.center[0];
          positions[index * 3 + 1] = data.getFloat32(source + 4, true) - specimen.center[1];
          positions[index * 3 + 2] = data.getFloat32(source + 8, true) - specimen.center[2];
          colors[index * 3] = data.getUint8(source + 12);
          colors[index * 3 + 1] = data.getUint8(source + 13);
          colors[index * 3 + 2] = data.getUint8(source + 14);
        }
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
        material = createPointCloudMaterial();

        const scene = new THREE.Scene();
        // Match GaussianSplats3D's perspective so the hover cloud stays registered.
        const camera = new THREE.PerspectiveCamera(POINT_CLOUD_CAMERA_FOV, (layerRef.current.clientWidth || 1) / (layerRef.current.clientHeight || 1), 0.01, 100);
        camera.position.set(0, 0, specimen.cameraDistance * POINT_CLOUD_CAMERA_SCALE);
        camera.up.set(0, 1, 0);
        camera.lookAt(0, 0, 0);
        scene.add(new THREE.Points(geometry, material));
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.dataset.pointCanvas = 'hover';
        renderer.domElement.style.position = 'absolute';
        renderer.domElement.style.left = '0px';
        renderer.domElement.style.top = '0px';
        renderer.domElement.style.zIndex = '5';
        renderer.domElement.style.pointerEvents = 'none';
        renderer.domElement.style.opacity = '0';
        layerRef.current.appendChild(renderer.domElement);
        renderers.push(renderer);
        cameras.push({ renderer, camera, scene });

        const resize = () => {
          const width = layerRef.current?.clientWidth || 120;
          const height = layerRef.current?.clientHeight || 120;
          cameras.forEach(({ renderer, camera }) => {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height, false);
            renderer.domElement.style.width = `${width}px`;
            renderer.domElement.style.height = `${height}px`;
          });
          material.uniforms.uViewportHeight.value = height * Math.min(window.devicePixelRatio, 1.5);
          alignCanvases();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(layerRef.current);
        resize();
        const animate = () => {
          if (cancelled) return;
          const sourceCamera = viewerRef.current?.camera;
          if (sourceCamera) {
            const nextSnapshot = [
              sourceCamera.position.x, sourceCamera.position.y, sourceCamera.position.z,
              sourceCamera.quaternion.x, sourceCamera.quaternion.y, sourceCamera.quaternion.z, sourceCamera.quaternion.w,
              sourceCamera.fov, sourceCamera.zoom,
            ];
            const cameraChanged = !lastCameraSnapshot || nextSnapshot.some((value, index) => Math.abs(value - lastCameraSnapshot[index]) > 0.00001);
            const now = performance.now();
            const animationDue = now - lastRenderTime >= 1000 / POINT_CLOUD_RENDER_FPS;
            if (cameraChanged || animationDue) {
              material.uniforms.uTime.value = now * 0.001;
              cameras.forEach(({ renderer, camera, scene }) => {
                camera.position.copy(sourceCamera.position).sub(specimenCenter);
                camera.quaternion.copy(sourceCamera.quaternion);
                camera.fov = sourceCamera.fov || camera.fov;
                camera.zoom = sourceCamera.zoom || 1;
                camera.near = sourceCamera.near;
                camera.far = sourceCamera.far;
                camera.updateProjectionMatrix();
                renderer.render(scene, camera);
              });
              lastCameraSnapshot = nextSnapshot;
              lastRenderTime = now;
            }
          } else {
            cameras.forEach(({ renderer, camera, scene }) => renderer.render(scene, camera));
          }
          frameId = requestAnimationFrame(animate);
        };
        animate();
      } catch (error) {
        console.error('No se pudo preparar la nube de puntos en las máscaras', error);
      }
    }
    loadPointCloud();
    return () => {
      cancelled = true;
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      renderers.forEach((renderer) => { renderer.dispose(); renderer.domElement.remove(); });
      geometry?.dispose();
      material?.dispose();
    };
  }, [specimen]);

  return <div className="point-mask-layer" ref={layerRef} aria-hidden="true" />;
}

function SplatViewer({ specimen }) {
  // Carga el archivo .ksplat y mantiene la cámara principal del Gaussian.
  // viewerRef se comparte con PointMaskLayer para sincronizar zoom y movimiento.
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const [state, setState] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [loadStatus, setLoadStatus] = useState('Preparando visor');
  const [retryKey, setRetryKey] = useState(0);
  const [hoverTrail, setHoverTrail] = useState([]);

  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    async function load() {
      setState('loading');
      setProgress(0);
      setLoadStatus('Descargando Gaussian');
      try {
        const { SparkRenderer, SplatMesh } = await import('@sparkjsdev/spark');
        if (cancelled) return;
        const host = hostRef.current;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(POINT_CLOUD_CAMERA_FOV, 1, 0.01, 100);
        camera.position.set(specimen.center[0], specimen.center[1], specimen.center[2] + specimen.cameraDistance);
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        const canvas = renderer.domElement;
        const controls = new OrbitControls(camera, canvas);
        const spark = new SparkRenderer({ renderer });
        const resizeObserver = new ResizeObserver(resize);
        let splat;
        dispose = () => {
          resizeObserver.disconnect();
          renderer.setAnimationLoop(null);
          controls.dispose();
          splat?.dispose();
          spark.dispose();
          renderer.dispose();
          canvas.remove();
          viewerRef.current = null;
          dispose = () => {};
        };
        function resize() {
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        controls.target.set(...specimen.center);
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.update();
        resize();
        resizeObserver.observe(host);
        splat = new SplatMesh({
          url: `${import.meta.env.BASE_URL}scans/${specimen.file}`,
          onProgress: ({ loaded, total }) => {
            if (!cancelled && total) setProgress(Math.min(99, Math.round(100 * loaded / total)));
          },
        });
        scene.add(spark, splat);
        await splat.initialized;
        if (cancelled) return;
        host.appendChild(canvas);
        viewerRef.current = { camera };
        renderer.setAnimationLoop(() => {
          controls.update();
          renderer.render(scene, camera);
        });
        setProgress(100);
        setLoadStatus('Visor listo');
        setState('ready');
      } catch (error) {
        if (cancelled) return;
        console.error(`No se pudo cargar ${specimen.name}`, error);
        dispose();
        setLoadStatus('No se pudo cargar el archivo');
        setState('error');
      }
    }
    load();
    return () => { cancelled = true; dispose(); };
  }, [specimen, retryKey]);

  const updateHoverPoint = (event) => {
    if (!hostRef.current) return;
    const bounds = hostRef.current.getBoundingClientRect();
    const nextPoint = {
      x: Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)),
    };
    setHoverTrail((current) => [...current, nextPoint].slice(-14));
  };

  return <>
    <div className={`viewer ${state === 'ready' ? 'is-ready' : ''}`} ref={hostRef} role="region" aria-label={`Gaussian Splat de ${specimen.name}`} onPointerMove={updateHoverPoint} onPointerLeave={() => setHoverTrail([])}>
      <span className="viewer-index">{specimen.number} / DALIA</span>
      {state === 'ready' && <PointMaskLayer specimen={specimen} hoverTrail={hoverTrail} viewerRef={viewerRef} />}
      {state === 'ready' && <SpecimenAudio specimen={specimen} hostRef={hostRef} viewerRef={viewerRef} />}
      {state !== 'ready' && <div className={`viewer-prompt ${state === 'error' ? 'is-error' : ''}`} role={state === 'error' ? 'alert' : 'status'} aria-live="polite"><strong>{state === 'loading' ? loadStatus : 'No se pudo abrir el archivo'}</strong>{state === 'loading' && <><span>{progress}% · La flor está tomando forma</span><span className="load-track" role="progressbar" aria-label="Progreso de carga" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${Math.max(progress, 4)}%` }} /></span></>}{state === 'error' && <><span>Comprueba la conexión o intenta cargar el espécimen de nuevo.</span><button type="button" onClick={() => setRetryKey((key) => key + 1)}>Reintentar carga</button></>}</div>}
    </div>
  </>;
}

function SpecimenCard({ specimen }) {
  // Visor principal del espécimen.

  return (
    <motion.article className="specimen" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}>
      <SplatViewer specimen={specimen} />
    </motion.article>
  );
}

function DaliaAssistant({ specimen, onSpeciesData }) {
  // Vite redirige esta ruta al Webhook local:
  // http://localhost:5678/webhook-test/dalia
  const n8nWebhookUrl = '/api/n8n/webhook-test/dalia';
  const [pregunta, setPregunta] = useState('nombre_cientifico');
  const [respuesta, setRespuesta] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const preguntas = [
    ['nombre_cientifico', '¿Cuál es el nombre científico?'],
    ['familia_botanica', '¿A qué familia pertenece?'],
    ['descripcion', '¿Cómo es la Dalia?'],
    ['color', '¿De qué colores puede ser?'],
    ['tamano_aprox', '¿Cuánto mide?'],
    ['epoca_floracion', '¿Cuándo florece?'],
    ['habitat', '¿Dónde crece?'],
    ['altitud_aprox', '¿A qué altitud se encuentra?'],
    ['polinizadores', '¿Qué polinizadores atrae?'],
    ['estado_conservacion', '¿Cuál es su estado de conservación?'],
    ['usos_ecologicos', '¿Qué usos ecológicos tiene?'],
    ['fuentes', '¿Cuáles son sus fuentes?'],
  ];

  const consultarDalia = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setRespuesta('');

    try {
      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          especie: specimen.dataId,
          pregunta,
        }),
      });

      if (!response.ok) throw new Error('No se pudo conectar con n8n');

      const rawResponse = await response.text();
      if (!rawResponse.trim()) {
        throw new Error('EMPTY_N8N_RESPONSE');
      }

      let data = JSON.parse(rawResponse);
      // n8n puede devolver el objeto directamente o envolverlo en un arreglo/items.
      if (Array.isArray(data)) data = data[0] ?? {};
      if (Array.isArray(data.items)) data = data.items[0] ?? {};

      if (data.error) throw new Error(data.error);
      if (data.especie) onSpeciesData?.(data.especie);
      setRespuesta(
        data.respuesta ||
        data.visual?.descripcion ||
        data.especie?.descripcion ||
        'n8n no devolvió una respuesta.'
      );
    } catch (requestError) {
      console.error(requestError);
      setError('No fue posible obtener una respuesta. Verifica que n8n esté ejecutándose.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="dalia-assistant" id="asistente" aria-labelledby="assistant-title">
      <p className="eyebrow">Consulta biocultural</p>
      <h2 id="assistant-title">Pregunta sobre la Dalia</h2>

      <form onSubmit={consultarDalia}>
        <label htmlFor="dalia-question">Selecciona una pregunta</label>
        <select
          id="dalia-question"
          value={pregunta}
          onChange={(event) => setPregunta(event.target.value)}
        >
          {preguntas.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button type="submit" disabled={loading}>
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
      </form>

      {respuesta && (
        <div className="dalia-answer" aria-live="polite">
          <small>Respuesta registrada</small>
          <p>{respuesta}</p>
        </div>
      )}

      {error && <p className="dalia-error" role="alert">{error}</p>}
    </section>
  );
}

function App() {
  // Estado global de la página: especie activa, navegación y scroll suave.
  const [specimenIndex, setSpecimenIndex] = useState(0);
  const specimen = specimens[specimenIndex];
  const [activeSection, setActiveSection] = useState('inicio');
  const [databaseFlower, setDatabaseFlower] = useState(null);

  const displaySpecimen = {
    ...specimen,
    name: databaseFlower?.nombreLocal || databaseFlower?.nombre || specimen.name,
    scientific: databaseFlower?.nombreCientifico || specimen.scientific,
    botanical: {
      ...specimen.botanical,
      family: databaseFlower?.familia || specimen.botanical.family,
      color: databaseFlower?.color || specimen.botanical.color,
      description: databaseFlower?.descripcion || specimen.botanical.description,
    },
  };

  useEffect(() => {
    document.title = `Floretum · ${displaySpecimen.name}`;
  }, [displaySpecimen.name]);

  const selectSpecimen = (nextIndex) => {
    setSpecimenIndex((nextIndex + specimens.length) % specimens.length);
    setDatabaseFlower(null);
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    window.requestAnimationFrame(() => document.getElementById('inicio')?.scrollIntoView({ behavior, block: 'start' }));
  };

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lenis = reducedMotion ? null : new Lenis({ autoRaf: false, smoothWheel: true, lerp: 0.08 });
    let animationFrame;
    const raf = (time) => {
      lenis?.raf(time);
      animationFrame = window.requestAnimationFrame(raf);
    };
    if (lenis) animationFrame = window.requestAnimationFrame(raf);

    const sections = ['inicio', 'flores'];
    const updateActiveSection = () => {
      const current = sections.reduce((visibleSection, sectionId) => {
        const section = document.getElementById(sectionId);
        if (!section) return visibleSection;
        return section.getBoundingClientRect().top <= 140 ? sectionId : visibleSection;
      }, 'inicio');
      setActiveSection(current);
    };

    updateActiveSection();
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateActiveSection);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      lenis?.destroy();
    };
  }, []);

  return (
    <main className="page">
      <motion.header className="topbar" initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
        <div className="topbar-inner">
          <a href="#inicio" className="brand">Floretum</a>
          <nav className="primary-nav" aria-label="Navegación principal">
            <a className={activeSection === 'inicio' ? 'active' : ''} href="#inicio">Inicio</a>
            <a className={activeSection === 'flores' ? 'active' : ''} href="#flores">Dalias</a>
          </nav>
          <span className="nav-status" aria-label="Estado del archivo">Archivo {String(specimenIndex + 1).padStart(2, '0')}</span>
        </div>
      </motion.header>
      <section className="intro hero-intro" id="inicio">
        <motion.div className="hero-copy" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}>
          <p className="eyebrow">Archivo vegetal · espécimen {specimen.number}</p>
          <h1 key={`${specimen.id}-${displaySpecimen.name}`}>{displaySpecimen.name}</h1>
          <p>Una flor registrada como materia, color y datos. Explórala en tres dimensiones y cambia la forma en que la observas.</p>
        </motion.div>
        <motion.div className="hero-meta" aria-label="Datos del espécimen" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12, delayChildren: 0.35 } } }}>
          {[
            [displaySpecimen.scientific, 'Nombre científico'],
            [`${specimen.number} / ${String(specimens.length).padStart(2, '0')}`, 'Archivo visual'],
            ['CDMX · 2026', 'Registro'],
          ].map(([value, label]) => (
            <motion.span key={label} variants={{ hidden: { opacity: 0, x: 14 }, visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: 'easeOut' } } }}>
              <b>{value}</b><small>{label}</small>
            </motion.span>
          ))}
          {specimens.length > 1 && (
            <div className="specimen-switcher" aria-label="Cambiar de espécimen">
              <button type="button" aria-label="Espécimen anterior" onClick={() => selectSpecimen(specimenIndex - 1)}>←</button>
              <span><b>{specimen.number}</b><small>de {String(specimens.length).padStart(2, '0')}</small></span>
              <button type="button" aria-label="Siguiente espécimen" onClick={() => selectSpecimen(specimenIndex + 1)}>→</button>
            </div>
          )}
        </motion.div>
      </section>
      <motion.section className="specimens hero-stage" id="flores" aria-label="Colección de dalias" initial={{ opacity: 0, y: 34 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}>
        <SpecimenCard key={`${specimen.id}-${displaySpecimen.name}`} specimen={displaySpecimen} />
      </motion.section>
      <DaliaAssistant specimen={specimen} onSpeciesData={setDatabaseFlower} />
      <footer>Floretum · Archivo vivo de flores</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<MotionConfig reducedMotion="user"><App /></MotionConfig>);





