import { useEffect, useState } from 'react';
import * as Tone from 'tone';
import { buildSoundEvents, loadPointCloud, DURATION, PENTATONIC_NOTES } from './sonify.js';
import { samplePointCloud } from './samplePointCloud.js';

const SAMPLE_INTERVAL = 85;
const LOCAL_DEGREES = [0, 2, 3, 5];
const PENTATONIC_DEGREES = PENTATONIC_NOTES.length - 1;

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
        const points = await loadPointCloud(specimen, controller.signal);
        if (controller.signal.aborted) return;
        const events = buildSoundEvents(points, specimen.center);
        stopPlayback = playLayers(events, points, specimen, host, viewerRef, () => pointer);
      } catch {
        if (!controller.signal.aborted) setError('No se pudo preparar el sonido de la dalia.');
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
    } catch {
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

function playLayers(events, points, specimen, host, viewerRef, getPointer) {
  const output = new Tone.Gain(0).toDestination();
  const loopPan = new Tone.Panner(0).connect(output);
  const loopSynth = new Tone.PolySynth(Tone.Synth).connect(loopPan);
  loopSynth.volume.value = -20;

  const localPan = new Tone.Panner(0).connect(output);
  const localGain = new Tone.Gain(0).connect(localPan);
  const filter = new Tone.Filter(800, 'lowpass').connect(localGain);
  const voice = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.08, sustain: 0.7, release: 0.18 },
  }).connect(filter);

  let currentMidi = events[0].midi;
  let sounding = false;
  const transport = Tone.getTransport();
  const part = new Tone.Part((time, event) => {
    currentMidi = event.midi;
    loopPan.pan.linearRampToValueAtTime(event.pan, time);
    loopSynth.triggerAttackRelease(Tone.Frequency(event.midi, 'midi').toFrequency(), event.duration, time, event.velocity);
  }, events);
  part.loopEnd = DURATION;
  part.loop = true;
  part.start(transport.seconds + 0.1);
  if (transport.state !== 'started') transport.start();
  output.gain.rampTo(1, 0.12);

  const timer = window.setInterval(() => {
    const pointer = getPointer();
    const camera = viewerRef.current?.camera;
    const region = pointer && camera && !document.hidden
      ? samplePointCloud(points, camera, host.getBoundingClientRect(), pointer)
      : null;

    if (!region) {
      if (sounding) {
        voice.triggerRelease();
        localGain.gain.rampTo(0, 0.12);
        sounding = false;
      }
      return;
    }

    const brightness = 0.21 * region.red + 0.72 * region.green + 0.07 * region.blue;
    const greenDominance = Math.max(0, region.green - Math.max(region.red, region.blue));
    const proximity = Math.min(1, specimen.cameraDistance / Math.max(region.depth, 0.001));
    const degreeOffset = LOCAL_DEGREES[Math.min(3, Math.floor(region.spread * 4))];
    const degree = PENTATONIC_NOTES.indexOf(currentMidi) + degreeOffset;
    const midi = PENTATONIC_NOTES[degree % PENTATONIC_DEGREES] + 12 * Math.floor(degree / PENTATONIC_DEGREES);
    const frequency = Tone.Frequency(midi, 'midi').toFrequency();
    filter.frequency.rampTo(300 + 2300 * brightness * (1 - greenDominance), 0.1);
    localPan.pan.rampTo(region.pan * 0.7, 0.1);
    localGain.gain.rampTo(Math.min(0.2, Math.sqrt(region.count) * 0.025) * proximity, 0.1);

    if (sounding) {
      voice.frequency.rampTo(frequency, 0.12);
    } else {
      voice.triggerAttack(frequency);
      sounding = true;
    }
  }, SAMPLE_INTERVAL);

  return () => {
    window.clearInterval(timer);
    part.dispose();
    output.gain.rampTo(0, 0.06);
    window.setTimeout(() => {
      voice.dispose();
      filter.dispose();
      localGain.dispose();
      localPan.dispose();
      loopSynth.dispose();
      loopPan.dispose();
      output.dispose();
    }, 160);
  };
}
