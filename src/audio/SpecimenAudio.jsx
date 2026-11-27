import { useEffect, useState } from 'react';
import * as Tone from 'tone';
import { buildSoundEvents, colorBrightness, loadPointCloud, DURATION } from './sonify.js';
import { samplePointCloud } from './samplePointCloud.js';
import { buildRhythm, loadSampleUrls } from './sampleArrangement.js';
import { loadSoundProfile } from './soundProfile.js';

const SAMPLE_INTERVAL = 85;

async function loadSamples(signal) {
  const urls = loadSampleUrls(import.meta.env.BASE_URL);
  return Promise.all(Object.entries(urls).map(async ([name, path]) => {
    const url = new URL(path, document.baseURI);
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await Tone.getContext().decodeAudioData(await response.arrayBuffer());
      return [name, buffer];
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error(`No se pudo cargar ${decodeURIComponent(url.pathname.split('/').pop())}.`, { cause: error });
    }
  }));
}

export default function SpecimenAudio({
  specimen, hostRef, viewerRef, ready, enabled, onEnabledChange,
}) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.intersectionRatio >= 0.2);
    }, { threshold: 0.2 });
    observer.observe(host);
    return () => observer.disconnect();
  }, [hostRef]);

  useEffect(() => {
    if (!enabled || !visible || !ready) return;

    const controller = new AbortController();
    const host = hostRef.current;
    let pointer = null;
    let stopPlayback = null;

    function trackPointer(event) {
      const overButton = event.target.closest('.viewer-sound-toggle');
      pointer = event.pointerType === 'mouse' && !overButton
        ? { x: event.clientX, y: event.clientY }
        : null;
    }

    function clearPointer() {
      pointer = null;
    }

    host.addEventListener('pointermove', trackPointer);
    host.addEventListener('pointerleave', clearPointer);
    host.addEventListener('pointercancel', clearPointer);

    async function prepare() {
      try {
        const [points, samples, profile] = await Promise.all([
          loadPointCloud(specimen, controller.signal),
          loadSamples(controller.signal),
          loadSoundProfile(specimen.dataId, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        const events = buildSoundEvents(points, specimen.center);
        stopPlayback = playLayers(samples, events, points, specimen, host, viewerRef, () => pointer, profile);
      } catch (error) {
        if (controller.signal.aborted) return;
        controller.abort();
        console.error('Error de reproducción de la dalia', error);
        setError(error.message);
      }
    }

    prepare();
    return () => {
      controller.abort();
      stopPlayback?.();
      host.removeEventListener('pointermove', trackPointer);
      host.removeEventListener('pointerleave', clearPointer);
      host.removeEventListener('pointercancel', clearPointer);
    };
  }, [enabled, visible, ready, specimen, hostRef, viewerRef]);

  async function toggleSound() {
    if (enabled) {
      onEnabledChange(false);
      return;
    }
    setError('');
    try {
      await Tone.start();
      onEnabledChange(true);
    } catch (error) {
      console.error('No se pudo activar el audio', error);
      setError('No se pudo activar el audio.');
    }
  }

  return (
    <>
      <button
        type="button"
        className="viewer-sound-toggle"
        onClick={toggleSound}
        aria-label="Sonido de la dalia"
        aria-pressed={enabled}
        title={enabled ? 'Silenciar sonido' : 'Activar sonido'}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M3 10v4m4-7v10m5-14v18m5-14v10m4-7v4" />
          {!enabled && <path className="viewer-sound-slash" d="M3 3l18 18" />}
        </svg>
      </button>
      {error && <p className="viewer-sound-error" role="alert">{error}</p>}
    </>
  );
}

function playLayers(buffers, events, points, specimen, host, viewerRef, getPointer, profile) {
  const output = new Tone.Gain(0).toDestination();
  const bassFilter = new Tone.Filter(700, 'lowpass').connect(output);
  const localPan = new Tone.Panner(0).connect(output);
  const localGain = new Tone.Gain(0).connect(localPan);
  const filter = new Tone.Filter(800, 'lowpass').connect(localGain);
  const rhythm = buildRhythm(events, DURATION, profile?.densidadRitmica);
  let chord = rhythm[0].chord;
  let lastGuitar = -Infinity;
  let wasHovering = false;
  let previousPointer = null;
  let pointerSpeed = 0;
  const samples = new Map(buffers.map(([name, buffer]) => {
    const guitar = name.startsWith('acoustic-') || name.startsWith('electric-');
    const destination = guitar ? filter : name.startsWith('bass-') ? bassFilter : output;
    const player = new Tone.Player({ url: buffer, fadeOut: 0.08 }).connect(destination);
    return [name, player];
  }));

  function playSample(name, time, volume, duration) {
    const player = samples.get(name);
    player.volume.setValueAtTime(volume, time);
    const playbackDuration = duration === undefined ? undefined : Math.min(duration, player.buffer.duration);
    player.start(time, undefined, playbackDuration);
  }

  const transport = Tone.getTransport();
  const part = new Tone.Part((time, step) => {
    chord = step.chord;
    bassFilter.frequency.linearRampToValueAtTime(180 * 12 ** step.brightness, time);
    if (step.drum) {
      const drumLevel = step.drum === 'hat' ? -35 + step.brightness * 18 : -23;
      playSample(step.drum, time, drumLevel + step.accent * 7);
    }
    if (step.bass) playSample(`bass-${chord}`, time, -21 + step.accent * 4);
  }, rhythm);
  part.loopEnd = DURATION;
  part.loop = true;
  part.start(transport.seconds + 0.1);
  if (transport.state !== 'started') transport.start();
  output.gain.rampTo(1, 0.12);
  const timer = window.setInterval(updateHover, SAMPLE_INTERVAL);

  function updateHover() {
    const pointer = getPointer();
    const camera = viewerRef.current?.camera;
    const region = pointer && camera && !document.hidden
      ? samplePointCloud(points, camera, host.getBoundingClientRect(), pointer)
      : null;

    if (!region) {
      if (wasHovering) localGain.gain.rampTo(0, 0.12);
      wasHovering = false;
      previousPointer = null;
      pointerSpeed = 0;
      return;
    }

    const brightness = colorBrightness(region.red, region.green, region.blue);
    const greenDominance = Math.max(0, region.green - Math.max(region.red, region.blue));
    const proximity = Math.min(1, specimen.cameraDistance / Math.max(region.depth, 0.001));
    const guitar = brightness > 0.38 && greenDominance < 0.04 ? 'acoustic' : 'electric';
    const now = Tone.now();
    if (previousPointer) {
      const distance = Math.hypot(pointer.x - previousPointer.x, pointer.y - previousPointer.y);
      const speed = distance / Math.max(now - previousPointer.time, 0.001);
      pointerSpeed = 0.45 * pointerSpeed + 0.55 * speed;
    }
    previousPointer = { ...pointer, time: now };
    filter.frequency.rampTo(450 + 3200 * brightness, 0.1);
    localPan.pan.rampTo(region.pan * 0.7, 0.1);
    localGain.gain.rampTo(Math.min(0.55, 0.12 + Math.sqrt(region.count) * 0.055) * proximity, 0.1);

    const motion = Math.min(1, pointerSpeed / 650);
    const retriggerAfter = 0.95 - 0.71 * motion - 0.04 * region.spread;
    if (now - lastGuitar >= (wasHovering ? retriggerAfter : 0.2)) {
      if (profile) {
        const acoustic = profile.mezclaAcustica;
        const electric = 1 - acoustic;
        if (acoustic > 0) {
          playSample(`acoustic-${chord}`, now, -14 + Tone.gainToDb(acoustic), profile.duracionCapaSeg);
        }
        if (electric > 0) {
          playSample(`electric-${chord}`, now, -14 + Tone.gainToDb(electric), profile.duracionCapaSeg);
        }
      } else {
        playSample(`${guitar}-${chord}`, now, -14);
      }
      wasHovering = true;
      lastGuitar = now;
    }
  }

  return () => {
    window.clearInterval(timer);
    part.dispose();
    output.gain.rampTo(0, 0.06);
    window.setTimeout(() => {
      samples.forEach((player) => player.dispose());
      bassFilter.dispose();
      filter.dispose();
      localGain.dispose();
      localPan.dispose();
      output.dispose();
    }, 160);
  };
}
