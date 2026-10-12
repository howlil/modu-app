import { describe, expect, it } from 'vitest';
import { buildIntelligenceSnapshot, localWindow } from '../../src/lib/modules/daily-execution/core/analytics.ts';
import { combineEvidence, uniqueEvidence, type EvidenceRecord } from '../../src/lib/modules/daily-execution/core/evidence.ts';
import { DEFAULT_HABIT, habitWeekSummary } from '../../src/lib/modules/daily-execution/core/consistency.ts';
import type { ExecutionTask } from '../../src/lib/modules/daily-execution/core/planning.ts';
import type { FocusActivitySession } from '../../src/lib/shared/focus-sessions/types.ts';

const task = (id: string): ExecutionTask => ({
  id, title: id, nextAction: 'Test', workstream: 'interview',
  impact: 'high', estimateMinutes: 60, status: 'ready', createdAt: 1
});
const session = (id: string, endedAt: number, taskId: string | null = 't'): FocusActivitySession => ({
  id, startedAt: endedAt - 25 * 60_000, endedAt,
  actualDurationMs: 20 * 60_000, plannedDurationMs: 25 * 60_000,
  overtimeMs: 0, goalMs: 8 * 3_600_000, label: 'practice', status: 'completed', taskId
});
const evidence = (id: string, occurredAt: number): EvidenceRecord => ({
  id, source: 'manual', kind: 'assessment', title: 'Mock', observation: 'Review',
  occurredAt, verification: 'user-reported'
});
describe('M3 intelligence from authoritative records', () => {
  it('uses half-open local rolling windows', () => {
    const now = new Date(2026, 9, 13, 13, 0).getTime();
    const win = localWindow(7, now);
    expect(new Date(win.from).getDate()).toBe(7);
    expect(new Date(win.to).getDate()).toBe(14);
  });
  it('separates measured focus, manual time, workstreams and outcomes', () => {
    const day = new Date(2026, 9, 12, 12).getTime();
    const one = session('s1', day);
    const unassigned = session('s2', day + 60_000, null);
    const done: ExecutionTask = { ...task('t'), status:'done', outcome:'Passed', completedAt:day };
    const snap = buildIntelligenceSnapshot([one, unassigned],
      [{ id:'m1', taskId:'t', startedAt:day-60*60_000, endedAt:day-30*60_000 }],
      [done], [evidence('e1', day)], day-24*60*60_000, day+24*60*60_000);
    expect(snap.focusMs).toBe(40*60_000);
    expect(snap.manualMs).toBe(30*60_000);
    expect(snap.workstreamMs.interview).toBe(50*60_000);
    expect(snap.completedTasks).toBe(1);
    expect(snap.evidenceCount).toBe(1);
    expect(snap.unassignedSessions).toBe(1);
  });
  it('projects legacy outcomes once and deduplicates imported evidence', () => {
    const done: ExecutionTask = { ...task('t'), status:'done', outcome:'Passed', completedAt:123456 };
    const combined = combineEvidence([], [done]);
    expect(combined).toHaveLength(1);
    expect(combined[0].id).toBe('task-outcome:t');
    const imports = uniqueEvidence([
      { ...evidence('github:a', 1), source:'github', externalId:'pr-4' },
      { ...evidence('github:b', 1), source:'github', externalId:'pr-4' }
    ]);
    expect(imports).toHaveLength(1);
  });
  it('counts eligible days, not sessions, for consistency', () => {
    const timestamp = new Date(2026, 9, 12, 12).getTime();
    const results = habitWeekSummary(DEFAULT_HABIT, [session('a',timestamp),session('b',timestamp+60_000)], [task('t')], '2026-10-12');
    expect(results.completedDays).toBe(1);
  });
});
