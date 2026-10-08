import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWakeLockController } from '../../../src/lib/modules/pomodoro/wake-lock.ts';
import type { TimerStatus } from '../../../src/lib/modules/pomodoro/timer.ts';

afterEach(() => vi.unstubAllGlobals());

describe('pomodoro wake lock lifecycle', () => {
  it('acquires during focus and releases when paused', async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ release }));
    vi.stubGlobal('navigator', { wakeLock: { request } });
    vi.stubGlobal('document', { visibilityState: 'visible' });

    let status: TimerStatus = 'running';
    const controller = createWakeLockController(() => true, () => true, () => status);
    await controller.sync();
    expect(request).toHaveBeenCalledWith('screen');
    status = 'paused';
    await controller.sync();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('never requests a lock when not supported', async () => {
    const request = vi.fn();
    vi.stubGlobal('navigator', { wakeLock: { request } });
    vi.stubGlobal('document', { visibilityState: 'visible' });
    const controller = createWakeLockController(() => true, () => false, () => 'running');
    await controller.sync();
    expect(request).not.toHaveBeenCalled();
  });
});
