import { describe, it, expect } from 'vitest';
import { makePlan, type ExecutionTask } from '../../src/lib/modules/daily-execution/core/planning.ts';
import { proposeReplan, overlapsExistingWork } from '../../src/lib/modules/daily-execution/core/adaptive.ts';

function task(id: string, workstream: ExecutionTask['workstream'], dueDate?: string, status: ExecutionTask['status'] = 'ready'): ExecutionTask {
  return { id, title: id, nextAction: id, workstream, dueDate, status, impact: 'high', estimateMinutes: 45, createdAt: 1 };
}
describe('M2 adaptive planning', () => {
  it('allocates only unspent minutes and prioritizes deadlines', () => {
    const proposed = proposeReplan(makePlan('2026-10-12', 'medium'), [task('project','build'), task('tomorrow interview','interview','2026-10-13')], 100, '2026-10-12');
    expect(proposed.remainingMinutes).toBe(380);
    expect(Object.values(proposed.allocations).reduce((a,b)=>a+b,0)).toBe(380);
    expect(proposed.allocations.interview).toBeGreaterThan(proposed.allocations.build);
    expect(proposed.urgentTaskIds).toContain('tomorrow interview');
  });
  it('does not assign remaining time to blocked tasks or create time debt', () => {
    const result = proposeReplan(makePlan('2026-10-12','low'), [task('blocked','build',undefined,'blocked')], 400, '2026-10-12');
    expect(result.remainingMinutes).toBe(0);
    expect(Object.values(result.allocations).reduce((a,b)=>a+b,0)).toBe(0);
  });
  it('rejects manual time overlapping focus intervals including partial overlaps', () => {
    const sessions = [{startedAt:1000,endedAt:4000},{startedAt:5000,endedAt:7000}];
    expect(overlapsExistingWork(3000,4500,sessions)).toBe(true);
    expect(overlapsExistingWork(4000,5000,sessions)).toBe(false);
    expect(overlapsExistingWork(6000,7500,sessions)).toBe(true);
    expect(overlapsExistingWork(7000,8000,sessions)).toBe(false);
    expect(overlapsExistingWork(8000,7000,sessions)).toBe(true);
  });
});
