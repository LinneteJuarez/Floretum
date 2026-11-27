import * as Tone from 'tone';
import { Vector3 } from 'three';
import { samplePointCloud } from './samplePointCloud.js';
import { colorBrightness, DURATION } from './sonify.js';

const SAMPLE_INTERVAL = 85;
const MELODY = [0, 2, 7, 4, 9, 7, 2, 4];
const VOICES = {
  piano: { oscillator: { type: 'triangle8' }, envelope: { attack: 0.005, decay: 0.45, sustain: 0.1, release: 0.35 } },
  flauta: { oscillator: { type: 'sine' }, envelope: { attack: 0.09, decay: 0.15, sustain: 0.7, release: 0.2 } },
  arpa: { oscillator: { type: 'triangle' }, envelope: { attack: 0.008, decay: 0.4, sustain: 0.12, release: 0.45 } },
  guitarra: { oscillator: { type: 'triangle5' }, envelope: { attack: 0.006, decay: 0.24, sustain: 0.1, release: 0.18 } },
  neutro: { oscillator: { type: 'sine' }, envelope: { attack: 0.04, decay: 0.25, sustain: 0.25, release: 0.25 } },
};

export function playFlower(profile, points, specimen, host, viewerRef, getPointer) {
  const output = new Tone.Gain(0).toDestination();
  const pan = new Tone.Panner(0).connect(output);
  const melody = new Tone.Synth(VOICES[profile.timbre]).connect(output);
  const texture = new Tone.PolySynth(Tone.Synth, VOICES[profile.timbre]).connect(pan);
  const center = new Vector3(...specimen.center);
  const cameraDirection = new Vector3();
  const previousDirection = new Vector3();
  const frequency = (midi) => Tone.Frequency(midi, 'midi').toFrequency();
  let initialDistance = null;
  let zoom = 0;
  let rotation = 0;
  let previousPointer = null;
  let lastTexture = -Infinity;

  const grid = Array.from({ length: DURATION * 4 }, (_, step) => [step / 4, step]);
  const part = new Tone.Part((time, step) => {
    const interval = Math.round(profile.pulso_seg * (1 + zoom * 0.75) * 4);
    if (step % interval !== 0) return;
    const note = MELODY[(step / interval) % MELODY.length];
    melody.triggerAttackRelease(frequency(profile.nota_base + note), 0.45, time,
      profile.intensidad * (0.48 + rotation * 0.2));
  }, grid);
  part.loop = true;
  part.loopEnd = DURATION;
  const transport = Tone.getTransport();
  part.start(transport.seconds + 0.1);
  if (transport.state !== 'started') transport.start();
  output.gain.rampTo(0.55, 0.12);

  const timer = window.setInterval(() => {
    const camera = viewerRef.current?.camera;
    if (!camera || document.hidden) return;
    camera.getWorldPosition(cameraDirection).sub(center);
    const distance = Math.max(0.001, cameraDirection.length()) / (camera.zoom || 1);
    initialDistance ??= distance;
    zoom = Math.max(0, Math.min(1, 1 - distance / initialDistance));
    cameraDirection.normalize();
    const angle = previousDirection.lengthSq() ? previousDirection.angleTo(cameraDirection) : 0;
    rotation = 0.55 * rotation + 0.45 * Math.min(1, angle / 0.1);
    previousDirection.copy(cameraDirection);

    const pointer = getPointer();
    const region = pointer && samplePointCloud(points, camera, host.getBoundingClientRect(), pointer);
    if (!region) {
      previousPointer = null;
      return;
    }
    const motion = previousPointer
      ? Math.min(1, Math.hypot(pointer.x - previousPointer.x, pointer.y - previousPointer.y) / 32)
      : 0;
    previousPointer = pointer;
    const time = Tone.now();
    const localDensity = Math.min(1, Math.log2(region.count) / 10);
    if (time - lastTexture < 1.1 - 0.6 * motion - 0.18 * profile.textura - 0.08 * localDensity) return;
    const duration = 1.5 - 0.95 * motion;
    const pitch = Math.round(60 + 12 * (region.red - region.blue));
    const brightness = colorBrightness(region.red, region.green, region.blue);
    pan.pan.rampTo(region.pan * 0.7, 0.1);
    texture.triggerAttackRelease(frequency(pitch), duration, time, (0.12 + 0.36 * brightness));
    lastTexture = time;
  }, SAMPLE_INTERVAL);

  return () => {
    window.clearInterval(timer);
    part.dispose();
    output.gain.rampTo(0, 0.06);
    window.setTimeout(() => {
      melody.dispose();
      texture.dispose();
      pan.dispose();
      output.dispose();
    }, 160);
  };
}
