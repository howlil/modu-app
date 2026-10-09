import type { TimerStatus } from '../core/timer.ts';

/** Browser lifecycle integration; the Pomodoro route owns the policy callbacks. */
export function createWakeLockController(
  isEnabled: () => boolean,
  isSupported: () => boolean,
  getStatus: () => TimerStatus
) {
  let wakeLock: { release: () => Promise<void> } | null = null;

  async function request() {
    if (
      !isEnabled() ||
      !isSupported() ||
      document.visibilityState !== 'visible' ||
      (getStatus() !== 'running' && getStatus() !== 'overtime') ||
      wakeLock
    ) {
      return;
    }

    try {
      const nav = navigator as Navigator & {
        wakeLock?: {
          request: (type: 'screen') => Promise<{ release: () => Promise<void> }>;
        };
      };

      if (!nav.wakeLock) return;
      wakeLock = await nav.wakeLock.request('screen');
    } catch {
      wakeLock = null;
    }
  }

  async function release() {
    if (!wakeLock) return;
    try {
      await wakeLock.release();
    } catch {
      // Progressive enhancement: permission can disappear during a session.
    } finally {
      wakeLock = null;
    }
  }

  async function sync() {
    const status = getStatus();
    if (
      isEnabled() &&
      isSupported() &&
      (status === 'running' || status === 'overtime')
    ) {
      await request();
      return;
    }
    await release();
  }

  return { sync, release };
}
