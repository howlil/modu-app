import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFocusSessions, saveFocusSession, assignFocusSession, clearFocusSessions } from '../../src/lib/shared/focus-sessions/repository.ts';
import { consumePendingFocusTask, writePendingFocusTask } from '../../src/lib/shared/focus-sessions/context.ts';
import type { FocusActivitySession } from '../../src/lib/shared/focus-sessions/types.ts';
import { normalizePomodoroSnapshot } from '../../src/lib/modules/pomodoro/adapters/persistence.ts';

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

  it('restores active focus accounting and legacy snapshots', () => {
    const restored = normalizePomodoroSnapshot({
      timer: { mode: 'focus', status: 'paused', durationMs: 1500000, remainingMs: 900000 },
      focusAccounting: { accumulatedMs: 600000, runningSince: null }
    }, 500000);
    expect(restored.focusAccounting.accumulatedMs).toBe(600000);
    expect(restored.focusAccounting.runningSince).toBeNull();
    const legacy = normalizePomodoroSnapshot({ timer: { mode: 'focus', status: 'paused', durationMs: 1500000, remainingMs: 900000 } }, 500000);
    expect(legacy.focusAccounting.accumulatedMs).toBe(600000);
  });

  it('restores the linked task from the existing Pomodoro snapshot without breaking legacy snapshots', () => {
    const restored = normalizePomodoroSnapshot({
      linkedTask: { id: 'task-123', title: 'Verify duplicate callbacks' }
    }, 100_000);
    expect(restored.linkedTask).toEqual({ id: 'task-123', title: 'Verify duplicate callbacks' });
    expect(normalizePomodoroSnapshot({}, 100_000).linkedTask).toBeNull();
  });

  it('treats an explicit start request as one-shot and keeps older handoffs compatible', () => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    writePendingFocusTask({id:'task-9',title:'Personal errand',autoStart:true});
    expect(consumePendingFocusTask('task-9')).toEqual({id:'task-9',title:'Personal errand',autoStart:true});
    expect(consumePendingFocusTask('task-9')).toBeNull();
    writePendingFocusTask({id:'task-10',title:'Read a book'});
    expect(consumePendingFocusTask('task-10')).toEqual({id:'task-10',title:'Read a book'});
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
