import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disposeTypingAudio,
  playTypingKeySound
} from '../../../src/lib/modules/typing/adapters/sounds.ts';

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static initialState: 'running' | 'suspended' = 'running';

  state: 'running' | 'suspended' | 'closed';
  sampleRate = 44_100;
  currentTime = 0;
  destination = {} as AudioDestinationNode;
  sourceStarts = 0;
  oscillatorStarts = 0;
  resumeCalls = 0;
  gains: number[] = [];
  filters: Array<{ type: BiquadFilterType; frequency: number }> = [];
  private finishResume: (() => void) | null = null;

  constructor() {
    this.state = FakeAudioContext.initialState;
    FakeAudioContext.instances.push(this);
  }

  createBuffer() {
    return {
      getChannelData: () => new Float32Array(4_000)
    } as unknown as AudioBuffer;
  }

  createBufferSource() {
    return {
      buffer: null,
      connect() {},
      start: () => { this.sourceStarts += 1; },
      stop() {}
    } as unknown as AudioBufferSourceNode;
  }

  createOscillator() {
    return {
      type: 'triangle',
      frequency: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {}
      },
      connect() {},
      start: () => { this.oscillatorStarts += 1; },
      stop() {}
    } as unknown as OscillatorNode;
  }

  createBiquadFilter() {
    const filter = {
      type: 'bandpass' as BiquadFilterType,
      frequency: {
        setValueAtTime: (value: number) => {
          this.filters.push({ type: filter.type, frequency: value });
        }
      },
      Q: { setValueAtTime() {} },
      connect() {}
    };
    return filter as unknown as BiquadFilterNode;
  }

  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime: (value: number) => { this.gains.push(value); }
      },
      connect() {}
    } as unknown as GainNode;
  }

  resume() {
    this.resumeCalls += 1;
    return new Promise<void>((resolve) => {
      this.finishResume = () => {
        this.state = 'running';
        resolve();
      };
    });
  }

  finishPendingResume() {
    this.finishResume?.();
  }

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

describe('typing mechanical keyboard audio', () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeAudioContext.initialState = 'running';
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
  });

  afterEach(() => {
    disposeTypingAudio();
    vi.unstubAllGlobals();
  });

  it('produces a crisp high-frequency attack, short body and release', () => {
    expect(playTypingKeySound('correct', 'f')).toBe(true);

    const audio = FakeAudioContext.instances[0];
    expect(audio.sourceStarts).toBe(4);
    expect(audio.oscillatorStarts).toBe(1);
    expect(Math.max(...audio.gains)).toBeGreaterThan(0.16);
    expect(audio.filters.some((filter) =>
      filter.type === 'highpass' && filter.frequency >= 4000
    )).toBe(true);
    expect(audio.filters.some((filter) =>
      filter.type === 'bandpass' && filter.frequency >= 2000
    )).toBe(true);
  });

  it('keeps the spacebar deeper than a normal key', () => {
    expect(playTypingKeySound('space', ' ')).toBe(true);
    const spaceFilters = [...FakeAudioContext.instances[0].filters];

    disposeTypingAudio();
    expect(playTypingKeySound('correct', 'f')).toBe(true);
    const regularFilters = FakeAudioContext.instances[1].filters;

    expect(spaceFilters[0].frequency).toBeLessThan(regularFilters[0].frequency);
    expect(spaceFilters[1].frequency).toBeLessThan(regularFilters[1].frequency);
  });

  it('waits for the browser to unlock audio and avoids bursting queued keys', async () => {
    FakeAudioContext.initialState = 'suspended';

    expect(playTypingKeySound('correct', 'f')).toBe(true);
    expect(playTypingKeySound('space', ' ')).toBe(true);

    const audio = FakeAudioContext.instances[0];
    expect(audio.resumeCalls).toBe(1);
    expect(audio.sourceStarts).toBe(0);

    audio.finishPendingResume();
    await Promise.resolve();
    await Promise.resolve();

    expect(audio.sourceStarts).toBe(4);
    expect(audio.oscillatorStarts).toBe(1);
  });

  it('does not play a queued key after the typing page is destroyed', async () => {
    FakeAudioContext.initialState = 'suspended';

    playTypingKeySound('correct', 'f');
    const audio = FakeAudioContext.instances[0];
    disposeTypingAudio();
    audio.finishPendingResume();
    await Promise.resolve();

    expect(audio.sourceStarts).toBe(0);
  });

  it('handles browsers without Web Audio safely', () => {
    vi.stubGlobal('window', {});
    expect(playTypingKeySound()).toBe(false);
  });

  it('recovers a new audio context after the old one closes', () => {
    playTypingKeySound('correct', 'f');
    FakeAudioContext.instances[0].state = 'closed';

    expect(playTypingKeySound('correct', 'j')).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(2);
  });
});
