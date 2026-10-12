import { describe, expect, it } from 'vitest';
import { CAPACITY_PRESETS, makePlan, minutesLabel, nextTask, plannedMinutes, type ExecutionTask } from '../../src/lib/modules/daily-execution/core/planning.ts';

const t = (id: string, impact: 'low' | 'medium' | 'high', status: 'ready' | 'blocked' | 'done' = 'ready', dueDate?: string): ExecutionTask => ({
  id, title: id, nextAction: id + ' next', workstream: 'build', impact, status,
  estimateMinutes: 45, createdAt: id.charCodeAt(0), dueDate
});

describe('Daily Execution: deterministic planning', () => {
  it('supports the required 6/8/12-hour budgets', () => {
    expect(plannedMinutes(makePlan('2026-10-12', 'low'))).toBe(360);
    expect(plannedMinutes(makePlan('2026-10-12', 'medium'))).toBe(480);
    expect(plannedMinutes(makePlan('2026-10-12', 'high'))).toBe(720);
  });

  it('does not recommend blocked or completed work', () => {
    expect(nextTask([t('a', 'high', 'blocked'), t('b', 'medium')], '2026-10-12')?.id).toBe('b');
    expect(nextTask([t('a', 'high', 'done')], '2026-10-12')).toBeNull();
  });

  it('prefers a due action when its deadline has arrived', () => {
    expect(nextTask([t('a', 'high'), t('b', 'medium', 'ready', '2026-10-12')], '2026-10-12')?.id).toBe('b');
  });

  it('does not mutate presets when editing a plan', () => {
    const plan = makePlan('2026-10-12', 'medium');
    plan.allocations.build = 15;
    expect(CAPACITY_PRESETS.medium.build).toBe(210);
  });

  it('formats actual minutes separately from budgets', () => {
    expect(minutesLabel(150)).toBe('2h 30m');
    expect(minutesLabel(0)).toBe('0m');
  });
});
