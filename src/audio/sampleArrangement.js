const DRUMS = 'Casio WK-110 Drum Sample';
const STRINGS = 'Instruments Single Strings';
const CHORDS = ['c', 'f', 'e', 'c', 'g'];
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
  const summaries = new Map();
  let flowerPoints = 0;
  let flowerBrightnessSum = 0;

  for (const event of events) {
    const step = Math.floor(event.time / stepDuration);
    const summary = summaries.get(step) ?? { accent: 0, points: 0, brightnessSum: 0 };
    const brightnessSum = event.brightness * event.points;
    summary.accent = Math.max(summary.accent, event.velocity);
    summary.points += event.points;
    summary.brightnessSum += brightnessSum;
    summaries.set(step, summary);
    flowerPoints += event.points;
    flowerBrightnessSum += brightnessSum;
  }

  const flowerBrightness = flowerPoints ? flowerBrightnessSum / flowerPoints : 0;
  return CHORDS.flatMap((chord, bar) => Array.from({ length: STEPS_PER_CHORD }, (_, beat) => {
    const step = bar * STEPS_PER_CHORD + beat;
    const summary = summaries.get(step);
    const stepBrightness = summary ? summary.brightnessSum / summary.points : flowerBrightness;
    return {
      time: step * stepDuration,
      chord,
      drum: beat % 4 === 0 ? 'kick' : beat % 8 === 2 ? 'rim' : 'hat',
      bass: beat === 0 || beat === 2,
      accent: summary?.accent ?? 0,
      brightness: 0.05 * flowerBrightness + 0.25 * stepBrightness,
    };
  }));
}
