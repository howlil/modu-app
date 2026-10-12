import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFocusSessions, saveFocusSession, assignFocusSession, clearFocusSessions } from '../../src/lib/shared/focus-sessions/repository.ts';
import { consumePendingFocusTask, writePendingFocusTask } from '../../src/lib/shared/focus-sessions/context.ts';
import type { FocusActivitySession } from '../../src/lib/shared/focus-sessions/types.ts';

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); }
  };
}

function legacySession(id: string): FocusActivitySession {
  return {
    id, startedAt: 1000, endedAt: 2000, plannedDurationMs: 1000,
    actualDurationMs: 1000, overtimeMs: 0, label: 'Focus', goalMs: 3600000, status: 'completed'
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Daily Execution ↔ Pomodoro session integration', () => {
  it('preserves legacy unassigned Pomodoro sessions', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', memoryStorage());
    await saveFocusSession(legacySession('old'));
    const [record] = await loadFocusSessions();
    expect(record.id).toBe('old');
    expect(record.taskId).toBeUndefined();
  });

  it('assigns an existing session without duplicating the duration', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', memoryStorage());
    await saveFocusSession(legacySession('focus-1'));
    await assignFocusSession('focus-1', 'task-123');
    const records = await loadFocusSessions();
    expect(records).toHaveLength(1);
    expect(records[0].taskId).toBe('task-123');
    expect(records[0].actualDurationMs).toBe(1000);
  });

  it('upserts repeated writes with the same session ID', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', memoryStorage());
    await saveFocusSession({ ...legacySession('focus-2'), taskId: 't2' });
    await saveFocusSession({ ...legacySession('focus-2'), taskId: 't2' });
    expect((await loadFocusSessions()).map((item) => item.id)).toEqual(['focus-2']);
  });

  it('does not change the record if the assigned session does not exist', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', memoryStorage());
    await expect(assignFocusSession('missing', 't')).rejects.toThrow();
  });

  it('uses a one-shot validated task handoff', () => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    writePendingFocusTask({ id: 'task-5', title: 'Test callbacks' });
    expect(consumePendingFocusTask('wrong')).toBeNull();
    expect(consumePendingFocusTask('task-5')).toBeNull();
    writePendingFocusTask({ id: 'task-5', title: 'Test callbacks' });
    expect(consumePendingFocusTask('task-5')).toEqual({ id: 'task-5', title: 'Test callbacks' });
    expect(consumePendingFocusTask('task-5')).toBeNull();
  });
});
