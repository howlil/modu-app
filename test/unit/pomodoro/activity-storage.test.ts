import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearFocusSessions,
  loadFocusSessions,
  saveFocusSession,
  saveFocusSessions
} from '../../../src/lib/modules/pomodoro/adapters/activity-storage.ts';
import type { FocusActivitySession } from '../../../src/lib/modules/pomodoro/core/activity.ts';

function session(id: string, endedAt: number): FocusActivitySession {
  return {
    id,
    startedAt: endedAt - 60_000,
    endedAt,
    plannedDurationMs: 60_000,
    actualDurationMs: 60_000,
    overtimeMs: 0,
    label: id,
    goalMs: 28_800_000,
    status: 'completed'
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('pomodoro activity storage fallback', () => {
  function withoutIndexedDb() {
    const values = new Map<string, string>();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); }
    });
    return values;
  }

  it('saves and restores sessions locally when IndexedDB is unavailable', async () => {
    const values = withoutIndexedDb();
    await saveFocusSession(session('first', 100_000));
    await saveFocusSession(session('second', 200_000));
    expect((await loadFocusSessions()).map((item) => item.id)).toEqual(['second', 'first']);
    expect(values.has('module-pomodoro-activity-fallback')).toBe(true);
    await clearFocusSessions();
    expect(await loadFocusSessions()).toEqual([]);
  });

  it('upserts sessions by ID rather than duplicating on migration', async () => {
    withoutIndexedDb();
    await saveFocusSessions([session('a', 100_000), session('b', 200_000)]);
    await saveFocusSessions([session('a', 300_000)]);
    expect((await loadFocusSessions()).map((item) => [item.id, item.endedAt])).toEqual([
      ['a', 300_000],
      ['b', 200_000]
    ]);
  });
});
