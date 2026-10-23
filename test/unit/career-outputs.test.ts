import { describe, expect, it } from 'vitest';
import { createMoment } from '../../src/lib/modules/brag-document/core/moments.ts';
import {
  committedOutputDraft, createOutput, decodeOutput, moveOutputMoment,
  outputCandidates, projectOutputItems, removeOutputMoment, toggleOutputMoment,
  updateOutputGoal, updateOutputNarrative
} from '../../src/lib/modules/brag-document/core/outputs.ts';
import type { CareerMoment, NewOutputInput } from '../../src/lib/modules/brag-document/core/types.ts';

const at = new Date('2026-10-24T08:00:00Z');
const goal: NewOutputInput = {
  kind: 'interview', title: 'Backend interview',
  targetRole: 'Backend Engineer', organization: 'Example',
  period: { kind: 'year', year: 2026 }
};
const moment = (id: string, date = at): CareerMoment => createMoment(
  { note: 'Built the ' + id + ' reliability fix' }, id, date, 'link-' + id
);

describe('Career Output domain', () => {
  it('creates role-specific documents without requiring any source evidence', () => {
    const output = createOutput(goal, 'document-a', at);
    expect(output.items).toEqual([]);
    expect(output.revision).toBe(1);
    expect(decodeOutput(output)).toEqual(output);
    expect(() => createOutput({ ...goal, title: '   ' }, 'x', at)).toThrow();
    expect(() => createOutput({ ...goal, period: { kind: 'month', year: 2026, month: 13 } }, 'x', at)).toThrow();
  });

  it('supports independent selection, narratives and ordering across documents', () => {
    const a = moment('auth');
    const b = moment('api');
    const base = createOutput(goal, 'a', at);
    const first = toggleOutputMoment(toggleOutputMoment(base, a), b);
    const other = toggleOutputMoment(createOutput({ ...goal, title: 'Cloud portfolio' }, 'b', at), a);
    expect(first.items.map(item => item.momentId)).toEqual(['auth', 'api']);
    expect(first.items.map(item => item.position)).toEqual([0, 1]);
    const edited = updateOutputNarrative(first, a.id, 'I debugged the OAuth callback');
    expect(edited.items[0]?.narrative).toBe('I debugged the OAuth callback');
    expect(other.items[0]?.narrative).toBeNull();
    expect(a.note).toBe('Built the auth reliability fix');
    expect(moveOutputMoment(edited, b.id, -1).items.map(item => item.momentId)).toEqual(['api','auth']);
    expect(removeOutputMoment(edited, a.id).items.map(item => item.position)).toEqual([0]);
    expect(toggleOutputMoment(edited, a).items.map(item => item.momentId)).toEqual(['api']);
  });

  it('uses period only for discovery, not deletion of already selected stories', () => {
    const old = moment('old', new Date('2025-05-12T08:00:00Z'));
    const current = moment('new');
    const output = createOutput(goal, 'a', at);
    expect(outputCandidates([old, current], output).map(item => item.id)).toEqual(['new']);
    const selected = toggleOutputMoment(output, old);
    expect(projectOutputItems(selected, [old, current])[0]?.outOfPeriod).toBe(true);
    const repurposed = updateOutputGoal(selected, {
      ...goal, kind: 'application', title: 'Application', period: { kind: 'all-time' }
    });
    expect(repurposed.items).toHaveLength(1);
    expect(projectOutputItems(repurposed, [old])[0]?.outOfPeriod).toBe(false);
  });

  it('detects stale and missing source material without rewriting it', () => {
    const source = moment('routing');
    const selected = toggleOutputMoment(createOutput(goal, 'a', at), source);
    const newer = { ...source, note: 'Later edited fact', revision: source.revision + 1 };
    const changed = projectOutputItems(selected, [newer])[0]!;
    expect(changed.sourceChanged).toBe(true);
    expect(changed.title).toBe('Later edited fact');
    expect(projectOutputItems(selected, [])[0]?.missing).toBe(true);
    expect(removeOutputMoment(selected, source.id).items).toEqual([]);
  });

  it('validates revision increments and rejects duplicate or corrupted items', () => {
    const source = moment('a');
    const output = toggleOutputMoment(createOutput(goal, 'doc', at), source);
    const committed = committedOutputDraft(output, createOutput(goal, 'doc', at), new Date('2026-10-25T08:00:00Z'));
    expect(committed.revision).toBe(2);
    expect(() => decodeOutput({ ...output, items: [output.items[0], output.items[0]] })).toThrow();
    expect(() => decodeOutput({ ...output, items: [{ ...output.items[0], position: 1 }] })).toThrow();
    expect(() => decodeOutput({ ...output, targetRole: 123 })).toThrow();
    expect(() => committedOutputDraft(committed, output, at)).toThrow();
    expect(() => updateOutputNarrative(output, 'missing', 'x')).toThrow();
  });
});
