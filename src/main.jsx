import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const specimens = [
  {
    number: '01',
    id: 'amarilla',
    name: 'Dalia amarilla',
    scientific: 'Dahlia spp.',
    note: 'Flor amarilla',
    file: 'scan-01.ksplat',
    center: [-0.04565, -0.0768, 0.02628],
    cameraDistance: 0.37,
  },
  {
    number: '02',
    id: 'pompon-roja',
    name: 'Dalia pompón roja',
    scientific: 'Dahlia spp.',
    note: 'Tipo pompón · Flor roja',
    file: 'scan-02.ksplat',
    center: [-0.02789, -0.12974, 0.06956],
    cameraDistance: 0.37,
  },
];

function SplatViewer({ specimen, audioRef, onToggleAudio }) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const [state, setState] = useState('idle');

  useEffect(() => () => {
    viewerRef.current?.dispose?.();
    viewerRef.current = null;
  }, []);

  async function load() {
    if (state === 'loading' || state === 'ready') return;
    setState('loading');
    try {
      const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d');
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
        progressiveLoad: false,
        optimizeSplatData: true,
      });
      viewer.start();
      setState('ready');
    } catch (error) {
      console.error(`No se pudo cargar ${specimen.name}`, error);
      viewerRef.current?.dispose?.();
      viewerRef.current = null;
      setState('error');
    }
  }

  useEffect(() => {
    load();
  }, [specimen.id]);

  return (
    <div
      className={`viewer ${state === 'ready' ? 'is-ready' : ''}`}
      ref={hostRef}
      onClick={() => state === 'ready' && onToggleAudio()}
      aria-label="Gaussian de la dalia amarilla. Haz clic para escuchar su sonificación."
    >
      <span className="viewer-index">{specimen.number} / DALIA</span>
      {state !== 'ready' && (
        <div className="viewer-prompt">
          <strong>{specimen.name}</strong>
          <span>{state === 'loading' ? 'Preparando visor…' : state === 'error' ? 'No se pudo abrir el archivo' : 'Gaussian Splat optimizado'}</span>
          {state === 'error' && <button onClick={load}>Intentar de nuevo</button>}
        </div>
      )}
    </div>
  );
}

function SpecimenCard({ specimen, audioRef, playing, onToggleAudio }) {
  return (
    <article className="specimen">
      <SplatViewer specimen={specimen} audioRef={audioRef} onToggleAudio={onToggleAudio} />
      <div className="caption">
        <div className="caption-copy">
          <h2>{specimen.name}</h2>
          <p><i>{specimen.scientific}</i><span>{specimen.note}</span></p>
        </div>
        <div className="sonification-control">
          <p className="sonification-hint">{playing ? 'Sonificación en reproducción' : 'Haz clic en la flor para escuchar su sonificación'}</p>
          <button onClick={onToggleAudio}>{playing ? 'Pausar' : 'Escuchar'}</button>
        </div>
      </div>
    </article>
  );
}

function App() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const specimen = specimens[0];
  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch((error) => console.error('No se pudo iniciar la sonificación', error));
    } else {
      audio.pause();
    }
  };

  return (
    <main className="page">
      <header className="topbar"><a href="#inicio" className="brand">Floretum</a><a href="#flores">Dalias</a></header>
      <section className="intro" id="inicio">
        <p className="eyebrow">Registro vegetal · Gaussian Splats</p>
        <h1>Dalia amarilla</h1>
        <p>Explora la flor en tres dimensiones. Haz clic en el Gaussian para escuchar la sonificación.</p>
      </section>
      <section className="specimens" id="flores" aria-label="Colección de dalias">
        <SpecimenCard specimen={specimen} audioRef={audioRef} playing={playing} onToggleAudio={toggleAudio} />
      </section>
      <audio
        ref={audioRef}
        preload="none"
        src={`${import.meta.env.BASE_URL}audio/dalia-calma.wav`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <footer>Floretum · Archivo visual de dalias</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);





