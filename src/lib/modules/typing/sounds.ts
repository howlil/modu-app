export type TypingSoundKind = 'correct' | 'error' | 'space';

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

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

  const length = Math.max(1, Math.floor(audioContext.sampleRate * 0.035));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    const envelope = 1 - index / data.length;
    data[index] = (Math.random() * 2 - 1) * envelope;
  }

  noiseBuffer = buffer;
  return buffer;
}

export function playTypingKeySound(kind: TypingSoundKind = 'correct') {
  const audioContext = getAudioContext();
  if (!audioContext) return false;

  try {
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }

    const startAt = audioContext.currentTime + 0.002;
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();

    source.buffer = getNoiseBuffer(audioContext);
    filter.type = 'bandpass';

    if (kind === 'error') {
      filter.frequency.setValueAtTime(520, startAt);
      filter.Q.setValueAtTime(0.8, startAt);
    } else if (kind === 'space') {
      filter.frequency.setValueAtTime(900, startAt);
      filter.Q.setValueAtTime(0.7, startAt);
    } else {
      filter.frequency.setValueAtTime(1850, startAt);
      filter.Q.setValueAtTime(1.2, startAt);
    }

    const peak = kind === 'error' ? 0.014 : kind === 'space' ? 0.012 : 0.01;
    const duration = kind === 'space' ? 0.032 : 0.022;

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.0025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);

    source.start(startAt);
    source.stop(startAt + duration + 0.01);
    return true;
  } catch {
    return false;
  }
}

export function disposeTypingAudio() {
  noiseBuffer = null;

  if (!context) return;

  const active = context;
  context = null;
  void active.close().catch(() => undefined);
}
