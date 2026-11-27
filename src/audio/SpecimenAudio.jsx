import { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { colorBrightness, loadPointCloud } from './sonify.js';
import { playFlower } from './playFlower.js';

function buildProfile(points) {
  let brightness = 0;
  let warmth = 0;
  const count = points.byteLength / 16;
  for (let offset = 0; offset < points.byteLength; offset += 16) {
    const red = points.getUint8(offset + 12) / 255;
    const green = points.getUint8(offset + 13) / 255;
    const blue = points.getUint8(offset + 14) / 255;
    brightness += colorBrightness(red, green, blue);
    warmth += (red - blue + 1) / 2;
  }
  return {
    timbre: 'neutro',
    nota_base: Math.round(48 + 24 * warmth / count),
    intensidad: 0.2 + 0.8 * brightness / count,
    pulso_seg: 0.75,
    textura: Math.min(1, Math.log10(count) / 6),
  };
}

export default function SpecimenAudio({ specimen, hostRef, viewerRef }) {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const host = hostRef.current;
    let stopPlayback;
    let pointer = null;

    function trackPointer(event) {
      pointer = event.pointerType === 'mouse' && !event.target.closest('.viewer-sound-toggle')
        ? { x: event.clientX, y: event.clientY }
        : null;
    }
    function clearPointer() {
      pointer = null;
    }

    host.addEventListener('pointermove', trackPointer);
    host.addEventListener('pointerleave', clearPointer);
    host.addEventListener('pointercancel', clearPointer);
    loadPointCloud(specimen, controller.signal).then((points) => {
      if (controller.signal.aborted) return;
      stopPlayback = playFlower(buildProfile(points), points, specimen, host, viewerRef, () => pointer);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setError(failure.message);
      setEnabled(false);
    });

    return () => {
      controller.abort();
      stopPlayback?.();
      host.removeEventListener('pointermove', trackPointer);
      host.removeEventListener('pointerleave', clearPointer);
      host.removeEventListener('pointercancel', clearPointer);
    };
  }, [enabled, hostRef, specimen, viewerRef]);

  async function toggle() {
    if (enabled) {
      setEnabled(false);
      return;
    }
    setError('');
    try {
      await Tone.start();
      if (mounted.current) setEnabled(true);
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    }
  }

  return <>
    <button type="button" className="viewer-sound-toggle" aria-label="Sonido de la dalia" aria-pressed={enabled} onClick={toggle}>
      <span aria-hidden="true">{enabled ? '■' : '♪'}</span>
    </button>
    {error && <p role="alert" className="viewer-sound-error">{error}</p>}
  </>;
}
