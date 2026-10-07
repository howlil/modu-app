export type TypingSoundKind = 'correct' | 'error' | 'space';

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let strikeCounter = 0;

function getAudioContext() {
  if (typeof window === 'undefined') return null;

  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) return null;

  context ??= new AudioContextClass();
  return context;
}

function getNoiseBuffer(audioContext: AudioContext) {
  if (noiseBuffer) return noiseBuffer;

  const length = Math.max(1, Math.floor(audioContext.sampleRate * 0.08));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;

  for (let index = 0; index < data.length; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.2 + white * 0.8;
    data[index] = previous;
  }

  noiseBuffer = buffer;
  return buffer;
}

function variationFor(key?: string) {
  let hash = 17;

  for (const character of key ?? '') {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  strikeCounter = (strikeCounter + 1) % 13;
  const keyOffset = ((hash % 17) - 8) / 120;
  const strikeOffset = ((strikeCounter % 5) - 2) / 240;

  return 1 + keyOffset + strikeOffset;
}

function shapeGain(
  gain: GainNode,
  startAt: number,
  peak: number,
  duration: number
) {
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
}

function playNoiseLayer(
  audioContext: AudioContext,
  startAt: number,
  frequency: number,
  q: number,
  peak: number,
  duration: number
) {
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  source.buffer = getNoiseBuffer(audioContext);
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(frequency, startAt);
  filter.Q.setValueAtTime(q, startAt);
  shapeGain(gain, startAt, peak, duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);

  source.start(startAt);
  source.stop(startAt + duration + 0.006);
}

function playBody(
  audioContext: AudioContext,
  startAt: number,
  variation: number,
  kind: TypingSoundKind
) {
  const oscillator = audioContext.createOscillator();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  const base = kind === 'space' ? 116 : kind === 'error' ? 174 : 154;
  const duration = kind === 'space' ? 0.055 : 0.038;

  oscillator.type = kind === 'space' ? 'sine' : 'triangle';
  oscillator.frequency.setValueAtTime(base * variation, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(70, base * 0.62 * variation),
    startAt + duration
  );

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(kind === 'space' ? 760 : 1120, startAt);
  filter.Q.setValueAtTime(0.65, startAt);

  shapeGain(gain, startAt, kind === 'space' ? 0.026 : 0.017, duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.008);
}

export function playTypingKeySound(
  kind: TypingSoundKind = 'correct',
  key?: string
) {
  const audioContext = getAudioContext();
  if (!audioContext) return false;

  try {
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }

    const startAt = audioContext.currentTime + 0.0015;
    const variation = variationFor(key);

    playNoiseLayer(
      audioContext,
      startAt,
      (kind === 'space' ? 1800 : kind === 'error' ? 3150 : 2550) * variation,
      kind === 'space' ? 0.75 : 1.15,
      kind === 'space' ? 0.022 : kind === 'error' ? 0.024 : 0.019,
      kind === 'space' ? 0.013 : 0.009
    );

    playBody(audioContext, startAt, variation, kind);

    playNoiseLayer(
      audioContext,
      startAt + 0.001,
      (kind === 'space' ? 620 : 920) * variation,
      kind === 'space' ? 1.0 : 1.5,
      kind === 'space' ? 0.011 : 0.007,
      kind === 'space' ? 0.05 : 0.032
    );

    playNoiseLayer(
      audioContext,
      startAt + (kind === 'space' ? 0.036 : 0.025),
      (kind === 'space' ? 1450 : 2200) * variation,
      1.25,
      kind === 'space' ? 0.0065 : 0.005,
      0.008
    );

    return true;
  } catch {
    return false;
  }
}

export function disposeTypingAudio() {
  noiseBuffer = null;
  strikeCounter = 0;

  if (!context) return;

  const active = context;
  context = null;
  void active.close().catch(() => undefined);
}
