//activa audio cuando pulsamos un boton
import { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { buildSoundEvents, loadPointCloud } from './sonify.js';

export default function SpecimenAudio({ specimen }) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const playbackRef = useRef(null);
  const playbackId = useRef(0);

  function stop() {
    playbackId.current += 1;
    playbackRef.current?.synth.dispose();
    playbackRef.current?.panner.dispose();
    playbackRef.current = null;
  }

  useEffect(() => {
    const controller = new AbortController();

    async function prepare() {
      try {
        const points = await loadPointCloud(specimen, controller.signal);
        if (controller.signal.aborted) return;

        const nextEvents = buildSoundEvents(points, specimen.center);
        console.table(nextEvents);
        setEvents(nextEvents);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError.message);
      }
    }

    prepare();

    return () => {
      controller.abort();
      stop();
    };
  }, [specimen]);

  async function play() {
    stop();
    const id = playbackId.current;
    setError('');

    try {
      await Tone.start();
      if (id !== playbackId.current) return;

      const panner = new Tone.Panner(0).toDestination();
      const synth = new Tone.PolySynth(Tone.Synth).connect(panner);
      synth.volume.value = -18;
      playbackRef.current = { synth, panner };

      const startTime = Tone.now() + 0.1;

      for (const event of events) {
        const time = startTime + event.time;
        const note = Tone.Frequency(event.midi, 'midi').toNote();

        panner.pan.linearRampToValueAtTime(event.pan, time);
        synth.triggerAttackRelease(note, event.duration, time, event.velocity);
      }
    } catch (playError) {
      if (id === playbackId.current) {
        stop();
        setError(playError.message);
      }
    }
  }

  return (
    <div>
      <button type="button" onClick={play} disabled={events.length === 0}>
        Escuchar flor
      </button>
      <button type="button" onClick={stop}>
        Detener
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}