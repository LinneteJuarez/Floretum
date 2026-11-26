const DRUMS = 'Casio WK-110 Drum Sample';
const STRINGS = 'Instruments Single Strings';
const CHORDS = ['c', 'f', 'g', 'c'];
const STEPS_PER_CHORD = 8;
const SAMPLE_URLS = {
  kick: `${DRUMS}/casio-wk-110-standard-kick.wav`,
  rim: `${DRUMS}/casio-wk-110-rim-click-1.wav`,
  hat: `${DRUMS}/casio-wk-110-standard-closed-hihat.wav`,
};

for (const chord of new Set(CHORDS)) {
  SAMPLE_URLS[`bass-${chord}`] = `${STRINGS}/bass-chord-${chord}-key.wav`;
  for (const guitar of ['acoustic', 'electric']) {
    SAMPLE_URLS[`${guitar}-${chord}`] = `${STRINGS}/guitar-chord-${guitar}-${chord}-key.wav`;
  }
}

export function loadSampleUrls(baseUrl) {
  return Object.fromEntries(
    Object.entries(SAMPLE_URLS).map(([name, path]) => [name, `${baseUrl}audio/${encodeURI(path)}`]),
  );
}

export function buildRhythm(events, duration) {
  const stepDuration = duration / (CHORDS.length * STEPS_PER_CHORD);
  const levels = new Map();

  for (const event of events) {
    const step = Math.floor(event.time / stepDuration);
    levels.set(step, Math.max(levels.get(step) ?? 0, event.velocity));
  }

  return CHORDS.flatMap((chord, bar) => Array.from({ length: STEPS_PER_CHORD }, (_, beat) => {
    const step = bar * STEPS_PER_CHORD + beat;
    return {
      time: step * stepDuration,
      chord,
      drum: beat % 4 === 0 ? 'kick' : beat % 4 === 2 ? 'rim' : 'hat',
      bass: beat === 0 || beat === 4,
      accent: levels.get(step) ?? 0,
    };
  }));
}
