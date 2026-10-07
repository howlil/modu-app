export type PomodoroRingtone = 'soft-chime' | 'bright-bell' | 'gentle-pluck';

export const DEFAULT_RINGTONE: PomodoroRingtone = 'soft-chime';

export const RINGTONE_OPTIONS: Array<{
  id: PomodoroRingtone;
  label: string;
  description: string;
}> = [
  {
    id: 'soft-chime',
    label: 'Soft chime',
    description: 'Calm two-note finish'
  },
  {
    id: 'bright-bell',
    label: 'Bright bell',
    description: 'Clearer end-of-session cue'
  },
  {
    id: 'gentle-pluck',
    label: 'Gentle pluck',
    description: 'Short and quiet'
  }
];

export function isPomodoroRingtone(value: unknown): value is PomodoroRingtone {
  return (
    value === 'soft-chime' ||
    value === 'bright-bell' ||
    value === 'gentle-pluck'
  );
}

type ToneStep = {
  frequency: number;
  offset: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
};

const PATTERNS: Record<PomodoroRingtone, ToneStep[]> = {
  'soft-chime': [
    { frequency: 523.25, offset: 0, duration: 0.42, gain: 0.032, type: 'sine' },
    { frequency: 659.25, offset: 0.14, duration: 0.58, gain: 0.026, type: 'sine' }
  ],
  'bright-bell': [
    { frequency: 659.25, offset: 0, duration: 0.26, gain: 0.036, type: 'sine' },
    { frequency: 880, offset: 0.12, duration: 0.38, gain: 0.028, type: 'sine' },
    { frequency: 1046.5, offset: 0.24, duration: 0.46, gain: 0.018, type: 'sine' }
  ],
  'gentle-pluck': [
    { frequency: 440, offset: 0, duration: 0.22, gain: 0.034, type: 'triangle' },
    { frequency: 554.37, offset: 0.09, duration: 0.28, gain: 0.024, type: 'triangle' }
  ]
};

export async function playPomodoroRingtone(ringtone: PomodoroRingtone) {
  if (typeof window === 'undefined') return false;

  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) return false;

    const context = new AudioContextClass();

    if (context.state === 'suspended') {
      await context.resume();
    }

    const startAt = context.currentTime + 0.01;
    let latestEnd = startAt;

    for (const step of PATTERNS[ringtone]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const toneStart = startAt + step.offset;
      const toneEnd = toneStart + step.duration;

      oscillator.type = step.type ?? 'sine';
      oscillator.frequency.setValueAtTime(step.frequency, toneStart);

      gain.gain.setValueAtTime(0.0001, toneStart);
      gain.gain.exponentialRampToValueAtTime(step.gain, toneStart + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(toneStart);
      oscillator.stop(toneEnd + 0.02);

      latestEnd = Math.max(latestEnd, toneEnd);
    }

    window.setTimeout(() => {
      void context.close();
    }, Math.max(250, (latestEnd - context.currentTime + 0.15) * 1000));

    return true;
  } catch {
    return false;
  }
}
