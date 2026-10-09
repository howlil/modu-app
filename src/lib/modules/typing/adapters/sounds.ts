export type TypingSoundKind = 'correct' | 'error' | 'space';

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let strikeCounter = 0;
let resumeRequest: Promise<void> | null = null;
let pendingStrike: { kind: TypingSoundKind; key?: string } | null = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;

  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) return null;

  // A browser can close an AudioContext when the audio device changes.
  if (context?.state === 'closed') {
    context = null;
    noiseBuffer = null;
    resumeRequest = null;
    pendingStrike = null;
  }

  try {
    context ??= new AudioContextClass();
    return context;
  } catch {
    return null;
  }
}

function getNoiseBuffer(audioContext: AudioContext) {
  if (noiseBuffer) return noiseBuffer;

  const length = Math.max(1, Math.floor(audioContext.sampleRate * 0.08));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;

  for (let index = 0; index < data.length; index += 1) {
    const white = Math.random() * 2 - 1;
    // Brighter broadband attack than the previous softened noise buffer.
    previous = previous * 0.08 + white * 0.92;
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
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.0006);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
}

function playNoiseLayer(
  audioContext: AudioContext,
  startAt: number,
  frequency: number,
  q: number,
  peak: number,
  duration: number,
  filterType: BiquadFilterType = 'bandpass'
) {
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  source.buffer = getNoiseBuffer(audioContext);
  filter.type = filterType;
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

  // Short keycap impact, not a sustained low-frequency synth note.
  const base = kind === 'space' ? 150 : kind === 'error' ? 240 : 205;
  const duration = kind === 'space' ? 0.032 : 0.019;

  oscillator.type = kind === 'space' ? 'sine' : 'triangle';
  oscillator.frequency.setValueAtTime(base * variation, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(70, base * 0.62 * variation),
    startAt + duration
  );

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(kind === 'space' ? 950 : 1500, startAt);
  filter.Q.setValueAtTime(0.65, startAt);

  shapeGain(gain, startAt, kind === 'space' ? 0.047 : 0.028, duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.008);
}

function scheduleStrike(
  audioContext: AudioContext,
  kind: TypingSoundKind,
  key?: string
) {
  if (audioContext.state !== 'running') return false;

  try {
    const startAt = audioContext.currentTime + 0.002;
    const variation = variationFor(key);

    // 1. Very fast broadband top attack: the crisp keycap click.
    // The high-pass preserves treble that the previous 2.5 kHz band-pass hid.
    playNoiseLayer(
      audioContext,
      startAt,
      (kind === 'space' ? 3600 : kind === 'error' ? 5100 : 4600) * variation,
      0.75,
      kind === 'space' ? 0.11 : kind === 'error' ? 0.19 : 0.17,
      kind === 'space' ? 0.011 : 0.008,
      'highpass'
    );

    // 2. Keycap bottom-out snap: slightly lower than the sharp top click.
    playNoiseLayer(
      audioContext,
      startAt + 0.0008,
      (kind === 'space' ? 1600 : kind === 'error' ? 3100 : 2450) * variation,
      kind === 'space' ? 0.85 : 1.0,
      kind === 'space' ? 0.12 : kind === 'error' ? 0.13 : 0.14,
      kind === 'space' ? 0.025 : 0.016
    );

    // 3. Short mechanical body, with a heavier spacebar.
    playBody(audioContext, startAt + 0.001, variation, kind);

    // 4. Brief plastic case resonance; avoid the lingering thock tail.
    playNoiseLayer(
      audioContext,
      startAt + 0.002,
      (kind === 'space' ? 950 : 1250) * variation,
      1.2,
      kind === 'space' ? 0.052 : 0.038,
      kind === 'space' ? 0.029 : 0.019
    );

    // 5. Small top-out click after the bottom-out, with no long decay.
    playNoiseLayer(
      audioContext,
      startAt + (kind === 'space' ? 0.028 : 0.020),
      (kind === 'space' ? 2800 : 3700) * variation,
      0.85,
      kind === 'space' ? 0.031 : 0.035,
      0.006,
      'highpass'
    );

    return true;
  } catch {
    return false;
  }
}

export function playTypingKeySound(
  kind: TypingSoundKind = 'correct',
  key?: string
) {
  const audioContext = getAudioContext();
  if (!audioContext) return false;

  if (audioContext.state === 'running') {
    return scheduleStrike(audioContext, kind, key);
  }

  if (audioContext.state !== 'suspended') return false;

  // Request resume while still inside the user's keydown or click gesture.
  // Queue only the latest strike: if resume takes time, don't burst many old
  // keystrokes all at once when the browser finally unlocks audio.
  pendingStrike = { kind, key };

  if (resumeRequest) return true;

  try {
    const request = audioContext.resume();
    resumeRequest = request;

    void request
      .then(() => {
        if (context !== audioContext) return;
        const strike = pendingStrike;
        pendingStrike = null;

        if (strike) scheduleStrike(audioContext, strike.kind, strike.key);
      })
      .catch(() => {
        if (context === audioContext) pendingStrike = null;
      })
      .finally(() => {
        if (resumeRequest === request) resumeRequest = null;
      });

    return true;
  } catch {
    pendingStrike = null;
    resumeRequest = null;
    return false;
  }
}

export function disposeTypingAudio() {
  noiseBuffer = null;
  strikeCounter = 0;
  pendingStrike = null;
  resumeRequest = null;

  if (!context) return;

  const active = context;
  context = null;
  void active.close().catch(() => undefined);
}
