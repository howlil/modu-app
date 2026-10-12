import { afterEach, describe, expect, it, vi } from 'vitest';
import { readExecutionState, saveExecutionState } from '../../src/lib/modules/daily-execution/adapters/persistence.ts';
import { emptyExecutionState } from '../../src/lib/modules/daily-execution/core/planning.ts';

afterEach(() => vi.unstubAllGlobals());

function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  });
  return values;
}

describe('M2 execution state compatibility', () => {
  it('reads M1 plans without inventing manual work', () => {
    const values = storage();
    values.set('modu-daily-execution-v1', JSON.stringify({
      goal: 'Backend SWE',
      successCriteria: '',
      plans: {},
      tasks: [],
      reflections: {}
    }));
    const loaded = readExecutionState();
    expect(loaded.goal).toBe('Backend SWE');
    expect(loaded.manualEntries).toEqual([]);
  });

  it('preserves accepted remaining allocations and checkpoint metadata', () => {
    storage();
    const state = emptyExecutionState();
    state.plans['2026-10-12'] = {
      dateKey: '2026-10-12', mode: 'medium',
      allocations: { build: 210, interview: 120, apply: 60, english: 60, review: 30 },
      revision: {
        reason: 'Interview tomorrow',
        remainingAllocations: { build: 90, interview: 180, apply: 40, english: 10, review: 0 },
        recordedAtAcceptanceMs: 9_600_000,
        acceptedAt: 12345
      }
    };
    state.tasks = [{
      id: 'task-1', title: 'Concurrency', nextAction: 'Test race',
      workstream: 'interview', impact: 'high', estimateMinutes: 90, status: 'ready',
      createdAt: 1,
      checkpoint: { lastCompleted: 'Lock experiment', blocker: 'Data race', nextAction: 'Add stress test', updatedAt: 10 }
    }];
    state.manualEntries = [{ id: 'manual-1', taskId: 'task-1', startedAt: 10_000, endedAt: 70_000 }];
    saveExecutionState(state);
    expect(readExecutionState()).toEqual(state);
  });
});
