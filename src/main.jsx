import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import Lenis from 'lenis';
import * as THREE from 'three';
import { specimens } from './data/specimens';
import {
  createPointCloudMaterial,
  POINT_CLOUD_CAMERA_FOV,
  POINT_CLOUD_CAMERA_SCALE,
  POINT_CLOUD_RENDER_FPS,
} from './shaders/pointCloud';
import SpecimenAudio from './audio/SpecimenAudio.jsx';
import './style.css';

// Capa de rayos X: el Gaussian permanece debajo y cada máscara recorta
// una nube de puntos a escala completa, sin volver a centrar la flor.
function PointMaskLayer({ specimen, masks, viewerRef, onStartDrag, onMove, onStopDrag }) {
  const layerRef = useRef(null);
  const masksRef = useRef(masks);
  masksRef.current = masks;

  const alignCanvases = () => {
    const layer = layerRef.current;
    if (!layer) return;
    const fullWidth = layer.clientWidth;
    const fullHeight = layer.clientHeight;
    masksRef.current.forEach((mask) => {
      const maskElement = layer.querySelector(`[data-mask="${mask.id}"]`);
      const canvas = layer.querySelector(`[data-point-canvas="${mask.id}"]`);
      if (!maskElement || !canvas) return;
      const maskWidth = maskElement.clientWidth || 120;
      const maskHeight = maskElement.clientHeight || 120;
      const left = mask.x / 100 * fullWidth - maskWidth / 2;
      const top = mask.y / 100 * fullHeight - maskHeight / 2;
      canvas.style.clipPath = `inset(${top}px ${Math.max(0, fullWidth - left - maskWidth)}px ${Math.max(0, fullHeight - top - maskHeight)}px ${Math.max(0, left)}px)`;
    });
  };

  useEffect(() => { window.requestAnimationFrame(alignCanvases); }, [masks]);

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

        masks.forEach((mask) => {
          const scene = new THREE.Scene();
          // Match GaussianSplats3D's default perspective exactly so the point
          // cloud occupies the same pixels as the underlying Gaussian.
          const camera = new THREE.PerspectiveCamera(POINT_CLOUD_CAMERA_FOV, (layerRef.current.clientWidth || 1) / (layerRef.current.clientHeight || 1), 0.01, 100);
          camera.position.set(0, 0, specimen.cameraDistance * POINT_CLOUD_CAMERA_SCALE);
          camera.up.set(0, -1, 0);
          camera.lookAt(0, 0, 0);
          scene.add(new THREE.Points(geometry, material));
          const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
          renderer.setClearColor(0x000000, 0);
          renderer.domElement.dataset.pointCanvas = mask.id;
          renderer.domElement.style.position = 'absolute';
          renderer.domElement.style.left = '0px';
          renderer.domElement.style.top = '0px';
          renderer.domElement.style.zIndex = '5';
          renderer.domElement.style.pointerEvents = 'none';
          layerRef.current.appendChild(renderer.domElement);
          renderers.push(renderer);
          cameras.push({ renderer, camera, scene });
        });

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

  return <div className="point-mask-layer" ref={layerRef} aria-label="Máscaras móviles de análisis">
    {masks.map((mask) => <div key={`${mask.id}-cover`} className="point-mask-cover" style={{ left: `${mask.x}%`, top: `${mask.y}%` }} aria-hidden="true" />)}
    {masks.map((mask) => <div key={mask.id} className="point-mask" data-mask={mask.id} style={{ left: `${mask.x}%`, top: `${mask.y}%` }} role="button" tabIndex="0" aria-label={`Máscara ${mask.id}. Arrastra para moverla`} onPointerDown={(event) => onStartDrag(event, mask)} onPointerMove={(event) => onMove(event, mask.id)} onPointerUp={onStopDrag} onPointerCancel={onStopDrag}>
      <span>{mask.id}</span>
    </div>)}
  </div>;
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
  const [masks, setMasks] = useState([{ id: 'M1', x: 24, y: 58 }, { id: 'M2', x: 66, y: 46 }]);
  const dragRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState('loading');
      setProgress(0);
      setLoadStatus('Descargando Gaussian');
      viewerRef.current?.dispose?.();
      viewerRef.current = null;
      hostRef.current?.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
      try {
        const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d');
        if (cancelled) return;
        const viewer = new GaussianSplats3D.Viewer({ rootElement: hostRef.current, sharedMemoryForWorkers: false, gpuAcceleratedSort: false, enableSIMDInSort: true, useBuiltInControls: true, sphericalHarmonicsDegree: 0, inMemoryCompressionLevel: 2, freeIntermediateSplatData: true, initialCameraPosition: [specimen.center[0], specimen.center[1], specimen.center[2] + specimen.cameraDistance], initialCameraLookAt: specimen.center, cameraUp: [0, -1, 0] });
        viewerRef.current = viewer;
        await viewer.addSplatScene(`${import.meta.env.BASE_URL}scans/${specimen.file}`, { showLoadingUI: false, progressiveLoad: true, optimizeSplatData: true, onProgress: (percentComplete) => { if (!cancelled) { setProgress(Math.round(percentComplete)); setLoadStatus(percentComplete >= 100 ? 'Procesando estructura' : 'Descargando Gaussian'); } } });
        if (cancelled) return;
        viewer.start();
        setProgress(100);
        setLoadStatus('Visor listo');
        setState('ready');
      } catch (error) {
        if (cancelled) return;
        console.error(`No se pudo cargar ${specimen.name}`, error);
        viewerRef.current?.dispose?.();
        viewerRef.current = null;
        setLoadStatus('No se pudo cargar el archivo');
        setState('error');
      }
    }
    load();
    return () => { cancelled = true; viewerRef.current?.dispose?.(); viewerRef.current = null; };
  }, [specimen, retryKey]);

  const moveMask = (event, maskId) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== maskId || !hostRef.current) return;
    const bounds = hostRef.current.getBoundingClientRect();
    const x = Math.max(2, Math.min(76, ((event.clientX - bounds.left) / bounds.width) * 100 - drag.offsetX));
    const y = Math.max(2, Math.min(76, ((event.clientY - bounds.top) / bounds.height) * 100 - drag.offsetY));
    setMasks((current) => current.map((mask) => mask.id === maskId ? { ...mask, x, y } : mask));
  };
  const startMaskDrag = (event, mask) => {
    if (!hostRef.current) return;
    const bounds = hostRef.current.getBoundingClientRect();
    dragRef.current = { id: mask.id, offsetX: ((event.clientX - bounds.left) / bounds.width) * 100 - mask.x, offsetY: ((event.clientY - bounds.top) / bounds.height) * 100 - mask.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const stopMaskDrag = (event) => { dragRef.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); };

  return <>
    <div className={`viewer ${state === 'ready' ? 'is-ready' : ''}`} ref={hostRef} role="region" aria-label={`Gaussian Splat de ${specimen.name}`}>
      <span className="viewer-index">{specimen.number} / DALIA</span>
      {state === 'ready' && <PointMaskLayer specimen={specimen} masks={masks} viewerRef={viewerRef} onStartDrag={startMaskDrag} onMove={moveMask} onStopDrag={stopMaskDrag} />}
      {state !== 'ready' && <div className={`viewer-prompt ${state === 'error' ? 'is-error' : ''}`} role={state === 'error' ? 'alert' : 'status'} aria-live="polite"><strong>{state === 'loading' ? loadStatus : 'No se pudo abrir el archivo'}</strong>{state === 'loading' && <><span>{progress}% · La flor está tomando forma</span><span className="load-track" role="progressbar" aria-label="Progreso de carga" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${Math.max(progress, 4)}%` }} /></span></>}{state === 'error' && <><span>Comprueba la conexión o intenta cargar el espécimen de nuevo.</span><button type="button" onClick={() => setRetryKey((key) => key + 1)}>Reintentar carga</button></>}</div>}
    </div>
    <div className="viewer-toolbar"><div className="mode-heading"><span>Gaussian · análisis de puntos</span><small>Mueve M1 y M2 para revelar la estructura</small></div></div>
  </>;
}

function SpecimenCard({ specimen }) {
  // Ficha visual de cada especie: visor, nombre y datos botánicos expandibles.
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <motion.article className="specimen" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}>
      <SplatViewer specimen={specimen} />
      <SpecimenAudio specimen={specimen} />
      <motion.div className="caption" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.6, delay: 0.15 }}>
        <div className="caption-copy">
          <h2>{specimen.name}</h2>
          <p><i>{specimen.scientific}</i><span>{specimen.note}</span></p>
        </div>
        <button type="button" className="botanical-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>
          <span>{detailsOpen ? 'Cerrar ficha' : 'Abrir ficha botánica'}</span><span aria-hidden="true">{detailsOpen ? '↑' : '↓'}</span>
        </button>
        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.div className="botanical-sheet" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              <div className="botanical-grid">
                <span><small>Familia</small><b>{specimen.botanical.family}</b></span>
                <span><small>Color registrado</small><b>{specimen.botanical.color}</b></span>
                <span><small>Densidad visual</small><b>{specimen.botanical.scan}</b></span>
              </div>
              <p className="botanical-description">{specimen.botanical.description}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.article>
  );
}

function DaliaAssistant() {
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
        body: JSON.stringify({ pregunta }),
      });

      if (!response.ok) throw new Error('No se pudo conectar con n8n');

      const data = await response.json();
      setRespuesta(data.respuesta || 'n8n no devolvió una respuesta.');
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

  const selectSpecimen = (nextIndex) => {
    setSpecimenIndex((nextIndex + specimens.length) % specimens.length);
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
          <h1 key={specimen.id}>{specimen.name}</h1>
          <p>Una flor registrada como materia, color y datos. Explórala en tres dimensiones y cambia la forma en que la observas.</p>
        </motion.div>
        <motion.div className="hero-meta" aria-label="Datos del espécimen" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12, delayChildren: 0.35 } } }}>
          {[
            [specimen.scientific, 'Nombre científico'],
            [`${specimen.number} / 02`, 'Archivo visual'],
            ['CDMX · 2026', 'Registro'],
          ].map(([value, label]) => (
            <motion.span key={label} variants={{ hidden: { opacity: 0, x: 14 }, visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: 'easeOut' } } }}>
              <b>{value}</b><small>{label}</small>
            </motion.span>
          ))}
          <div className="specimen-switcher" aria-label="Cambiar de espécimen">
            <button type="button" aria-label="Espécimen anterior" onClick={() => selectSpecimen(specimenIndex - 1)}>←</button>
            <span><b>{specimen.number}</b><small>de {String(specimens.length).padStart(2, '0')}</small></span>
            <button type="button" aria-label="Siguiente espécimen" onClick={() => selectSpecimen(specimenIndex + 1)}>→</button>
          </div>
        </motion.div>
      </section>
      <motion.section className="specimens hero-stage" id="flores" aria-label="Colección de dalias" initial={{ opacity: 0, y: 34 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}>
        <motion.span className="stage-label stage-label-left" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 1 }}>Vista principal</motion.span>
        <motion.span className="stage-label stage-label-right" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 1.1 }}>Arrastra para explorar</motion.span>
        <SpecimenCard key={specimen.id} specimen={specimen} />
        <motion.a className="scroll-cue" href="#archivo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 1.2 }}><span>↓</span> Explorar archivo</motion.a>
      </motion.section>
      <DaliaAssistant />
      <motion.section className="archive-anchor" id="archivo" aria-label="Archivo botánico" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.7 }}><span>Archivo botánico</span></motion.section>
      <footer>Floretum · Archivo visual de dalias</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<MotionConfig reducedMotion="user"><App /></MotionConfig>);





