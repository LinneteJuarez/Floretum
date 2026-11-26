import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import Lenis from 'lenis';
import * as THREE from 'three';
import './style.css';

const specimens = [
  {
    number: '01',
    id: 'amarilla',
    name: 'Dalia amarilla',
    scientific: 'Dahlia spp.',
    note: 'Flor amarilla',
    file: 'scan-01.ksplat',
    pointsFile: 'scan-01.points.bin',
    center: [-0.04565, -0.0768, 0.02628],
    cameraDistance: 0.37,
    botanical: { family: 'Asteraceae', color: 'Amarillo cálido', scan: '37,438 splats', description: 'Registro tridimensional de una dalia ornamental para observar su volumen, estructura y color.' },
  },
  {
    number: '02',
    id: 'pompon-roja',
    name: 'Dalia pompón roja',
    scientific: 'Dahlia spp.',
    note: 'Tipo pompón · Flor roja',
    file: 'scan-02.ksplat',
    pointsFile: 'scan-02.points.bin',
    center: [-0.02789, -0.12974, 0.06956],
    cameraDistance: 0.37,
    botanical: { family: 'Asteraceae', color: 'Rojo intenso', scan: '25,319 splats', description: 'Registro tridimensional de una dalia tipo pompón, conservando la densidad visual de sus pétalos.' },
  },
];

function SplatViewer({ specimen }) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const autoRotateRef = useRef(false);
  const [state, setState] = useState('idle');
  const [mode, setMode] = useState('splat');
  const [autoRotate, setAutoRotate] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadStatus, setLoadStatus] = useState('Preparando visor');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let frameId = null;
    let pointGeometry = null;
    let pointMaterial = null;
    let pointControls = null;
    let resizeObserver = null;

    async function load() {
      setState('loading');
      setProgress(0);
      setLoadStatus(mode === 'splat' ? 'Descargando Gaussian' : 'Descargando nube de puntos');
      viewerRef.current?.dispose?.();
      viewerRef.current = null;
      rendererRef.current?.dispose?.();
      rendererRef.current = null;
      controlsRef.current = null;
      // React owns the overlay labels/buttons inside this element; only clear
      // renderer canvases so a state update cannot make the whole page blank.
      hostRef.current?.querySelectorAll('canvas').forEach((canvas) => canvas.remove());

      try {
        if (mode === 'splat') {
          const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d');
          if (cancelled) return;
          const viewer = new GaussianSplats3D.Viewer({
            rootElement: hostRef.current,
            sharedMemoryForWorkers: false,
            gpuAcceleratedSort: false,
            enableSIMDInSort: true,
            useBuiltInControls: true,
            sphericalHarmonicsDegree: 0,
            inMemoryCompressionLevel: 2,
            freeIntermediateSplatData: true,
            initialCameraPosition: [
              specimen.center[0],
              specimen.center[1],
              specimen.center[2] + specimen.cameraDistance,
            ],
            initialCameraLookAt: specimen.center,
            cameraUp: [0, -1, 0],
          });
          viewerRef.current = viewer;
          await viewer.addSplatScene(`${import.meta.env.BASE_URL}scans/${specimen.file}`, {
            showLoadingUI: false,
            progressiveLoad: true,
            optimizeSplatData: true,
            onProgress: (percentComplete) => {
              if (cancelled) return;
              setProgress(Math.round(percentComplete));
              setLoadStatus(percentComplete >= 100 ? 'Procesando estructura' : 'Descargando Gaussian');
            },
          });
          if (cancelled) return;
          viewer.start();
          controlsRef.current = viewer.controls;
          if (controlsRef.current) controlsRef.current.autoRotate = autoRotateRef.current;
        } else {
          const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
          const response = await fetch(`${import.meta.env.BASE_URL}scans/${specimen.pointsFile}`);
          if (!response.ok) throw new Error(`No se pudo abrir ${specimen.pointsFile}`);
          const bytes = await response.arrayBuffer();
          if (cancelled) return;
          setProgress(100);
          setLoadStatus('Preparando nube de puntos');

          const count = bytes.byteLength / 16;
          const data = new DataView(bytes);
          const positions = new Float32Array(count * 3);
          const colors = new Uint8Array(count * 3);
          for (let index = 0; index < count; index += 1) {
            const source = index * 16;
            positions[index * 3] = data.getFloat32(source, true);
            positions[index * 3 + 1] = data.getFloat32(source + 4, true);
            positions[index * 3 + 2] = data.getFloat32(source + 8, true);
            colors[index * 3] = data.getUint8(source + 12);
            colors[index * 3 + 1] = data.getUint8(source + 13);
            colors[index * 3 + 2] = data.getUint8(source + 14);
          }

          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
          camera.position.set(specimen.center[0], specimen.center[1], specimen.center[2] + specimen.cameraDistance);
          camera.lookAt(...specimen.center);
          const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setClearColor(0x000000, 0);
          hostRef.current.appendChild(renderer.domElement);
          rendererRef.current = renderer;

          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
          pointGeometry = geometry;
          pointMaterial = new THREE.PointsMaterial({ size: 0.004, vertexColors: true, sizeAttenuation: true });
          const points = new THREE.Points(pointGeometry, pointMaterial);
          scene.add(points);

          const controls = new OrbitControls(camera, renderer.domElement);
          pointControls = controls;
          controls.target.set(...specimen.center);
          controls.enableDamping = true;
          controls.autoRotate = autoRotateRef.current;
          controlsRef.current = controls;

          const resize = () => {
            if (!hostRef.current) return;
            const { clientWidth, clientHeight } = hostRef.current;
            camera.aspect = clientWidth / clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(clientWidth, clientHeight, false);
          };
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(hostRef.current);
          resize();
          const animate = () => {
            if (cancelled) return;
            controls.update();
            renderer.render(scene, camera);
            frameId = requestAnimationFrame(animate);
          };
          animate();
        }
        if (!cancelled) {
          setProgress(100);
          setLoadStatus('Visor listo');
          setState('ready');
        }
      } catch (error) {
        if (cancelled) return;
        console.error(`No se pudo cargar ${specimen.name}`, error);
        viewerRef.current?.dispose?.();
        rendererRef.current?.dispose?.();
        viewerRef.current = null;
        rendererRef.current = null;
        controlsRef.current = null;
        pointControls?.dispose?.();
        pointGeometry?.dispose?.();
        pointMaterial?.dispose?.();
        setLoadStatus('No se pudo cargar el archivo');
        setState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      pointControls?.dispose?.();
      pointGeometry?.dispose?.();
      pointMaterial?.dispose?.();
      viewerRef.current?.dispose?.();
      rendererRef.current?.dispose?.();
      viewerRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, [mode, specimen, retryKey]);

  const toggleAutoRotate = () => {
    const nextValue = !autoRotateRef.current;
    autoRotateRef.current = nextValue;
    if (controlsRef.current) controlsRef.current.autoRotate = nextValue;
    setAutoRotate(nextValue);
  };

  const resetView = () => {
    controlsRef.current?.reset?.();
  };

  return (
    <>
      <div className={`viewer ${state === 'ready' ? 'is-ready' : ''}`} ref={hostRef} role="img" aria-label={`${mode === 'splat' ? 'Gaussian Splat' : 'Nube de puntos'} de ${specimen.name}`}>
        <span className="viewer-index">{specimen.number} / DALIA</span>
        {state !== 'ready' && <div className={`viewer-prompt ${state === 'error' ? 'is-error' : ''}`} role={state === 'error' ? 'alert' : 'status'} aria-live="polite">
          <strong>{state === 'loading' ? loadStatus : 'No se pudo abrir el archivo'}</strong>
          {state === 'loading' && <><span>{progress}% · {mode === 'splat' ? 'La flor está tomando forma' : 'Preparando posiciones y color'}</span><span className="load-track" role="progressbar" aria-label="Progreso de carga" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${Math.max(progress, 4)}%` }} /></span></>}
          {state === 'error' && <><span>Comprueba la conexión o intenta cargar el espécimen de nuevo.</span><button type="button" onClick={() => setRetryKey((key) => key + 1)}>Reintentar carga</button></>}
        </div>}
      </div>
      <div className="viewer-toolbar">
        <div className="mode-heading"><span>Modo de lectura</span><small>{mode === 'splat' ? 'Volumen · profundidad y luz' : 'Materia · posición y color'}</small></div>
        <div className="viewer-actions" aria-label="Controles de cámara">
          <button type="button" className={autoRotate ? 'tool-active' : ''} aria-pressed={autoRotate} onClick={toggleAutoRotate}><span aria-hidden="true">↻</span> Rotar</button>
          <button type="button" onClick={resetView}><span aria-hidden="true">⌂</span> Reiniciar</button>
        </div>
        <div className="viewer-modes" role="tablist" aria-label="Modo de visualización">
          <button type="button" role="tab" aria-selected={mode === 'splat'} className={mode === 'splat' ? 'selected' : ''} onClick={() => setMode('splat')}><span className="mode-index">01</span><span>Gaussian Splat</span></button>
          <button type="button" role="tab" aria-selected={mode === 'points'} className={mode === 'points' ? 'selected' : ''} onClick={() => setMode('points')}><span className="mode-index">02</span><span>Nube de puntos</span></button>
        </div>
      </div>
    </>
  );
}

function SpecimenCard({ specimen }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <motion.article className="specimen" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}>
      <SplatViewer specimen={specimen} />
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

function App() {
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
      <motion.section className="archive-anchor" id="archivo" aria-label="Archivo botánico" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.7 }}><span>Archivo botánico</span></motion.section>
      <footer>Floretum · Archivo visual de dalias</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<MotionConfig reducedMotion="user"><App /></MotionConfig>);





