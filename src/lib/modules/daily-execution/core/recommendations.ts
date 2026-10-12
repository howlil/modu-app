import type { ExecutionTask, Workstream } from './planning.ts';
import type { EvidenceRecord } from './evidence.ts';
import type { FocusActivitySession } from '#lib/shared/focus-sessions/types.ts';

export type RecommendationStatus = 'accepted' | 'rejected';
export interface RecommendationDecision {
  id: string;
  status: RecommendationStatus;
  decidedAt: number;
}
export interface WeeklyRecommendation {
  id: string;
  ruleId: string;
  title: string;
  reason: string;
  evidenceIds: string[];
  taskIds: string[];
  sessionIds: string[];
  workstream?: Workstream;
  suggestedMinutes: number;
  dataLimitations: string;
}

export function weeklyRecommendation(
  tasks: ExecutionTask[],
  evidence: EvidenceRecord[],
  sessions: FocusActivitySession[],
  weekStart: string,
  now: number,
  decisions: RecommendationDecision[]
): WeeklyRecommendation | null {
  const candidates: Array<WeeklyRecommendation & { priority: number }> = [];
  const currentDay = new Date(now);
  currentDay.setHours(0, 0, 0, 0);
  const tomorrow = new Date(currentDay);
  tomorrow.setDate(tomorrow.getDate() + 1);
  for (const task of tasks) {
    if (task.status !== 'ready' || !task.dueDate) continue;
    const due = new Date(task.dueDate + 'T00:00:00');
    if (!Number.isFinite(due.getTime()) || due.getTime() > tomorrow.getTime()) continue;
    candidates.push({
      id: 'deadline:' + weekStart + ':' + task.id + ':' + task.dueDate,
      ruleId: 'upcoming-deadline', title: 'Prioritize an upcoming deadline',
      reason: task.title + ' is due on ' + task.dueDate + ' and remains unfinished.',
      evidenceIds: [], taskIds: [task.id], sessionIds: [],
      workstream: task.workstream, suggestedMinutes: 45,
      dataLimitations: 'This is based on the task deadline entered in Modu, not an independently confirmed calendar event.',
      priority: 100
    });
  }
  const assessmentWindowStart = now - 28 * 24 * 3_600_000;
  const gaps = new Map<string, EvidenceRecord[]>();
  const assessments = evidence.filter((record) => record.kind === 'assessment' &&
    record.verification !== 'unverified' && !!record.topic?.trim() &&
    record.occurredAt >= assessmentWindowStart && record.occurredAt <= now);
  for (const record of assessments) {
    const topic = record.topic!.trim().toLowerCase();
    gaps.set(topic, [...(gaps.get(topic) ?? []), record]);
  }
  for (const [topic, records] of gaps) {
    const sorted = [...new Map(records.map((record) => [record.id, record])).values()]
      .sort((a,b)=>b.occurredAt-a.occurredAt);
    // A recent successful result supersedes older weaknesses.
    if (sorted[0]?.assessmentResult === 'passed') continue;
    const distinct = sorted.filter((record)=>record.assessmentResult==='needs-practice').slice(0,3);
    if (distinct.length < 2) continue;
    const ids = distinct.map((record) => record.id).sort();
    candidates.push({
      id: 'assessment-gap:' + weekStart + ':' + topic + ':' + ids.join(','),
      ruleId: 'repeated-assessment-gap',
      title: 'Practice ' + topic,
      reason: distinct.length + ' distinct assessment records identified ' + topic + ' as needing practice.',
      evidenceIds: ids, taskIds: distinct.flatMap((record) => record.taskId ? [record.taskId] : []),
      sessionIds: [], workstream: 'interview', suggestedMinutes: 60,
      dataLimitations: 'Assessments are interpreted as recorded by their sources. No skill-mastery claim is inferred.',
      priority: 70
    });
  }
  const blocked = tasks.filter((task) => task.status === 'blocked' && !!task.checkpoint?.blocker);
  if (blocked.length >= 2) {
    const ids = blocked.map((task) => task.id).sort();
    candidates.push({
      id: 'blocked:' + weekStart + ':' + ids.join(','),
      ruleId: 'blocked-work', title: 'Resolve recurring blockers',
      reason: blocked.length + ' blocked tasks have unresolved checkpoint notes.',
      evidenceIds: [], taskIds: ids, sessionIds: [], suggestedMinutes: 0,
      dataLimitations: 'A checkpoint is a user-entered observation; blockers may already have changed.',
      priority: 40
    });
  }
  const unassigned = sessions.filter((session) => !session.taskId || !tasks.some((task) => task.id === session.taskId));
  if (unassigned.length >= 3) {
    const ids = unassigned.map((session) => session.id).sort();
    candidates.push({
      id: 'unassigned:' + weekStart + ':' + ids.join(','),
      ruleId: 'unassigned-sessions', title: 'Review unassigned focus sessions',
      reason: unassigned.length + ' focus sessions have no valid task association.',
      evidenceIds: [], taskIds: [], sessionIds: ids, suggestedMinutes: 0,
      dataLimitations: 'Not all focus sessions need to belong to a task; association is optional.',
      priority: 20
    });
  }
  const reviewed = new Set(decisions.map((decision) => decision.id));
  return candidates.filter((candidate) => !reviewed.has(candidate.id))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
}

export function adjustRemainingAllocation(
  allocations: Record<Workstream, number>,
  target: Workstream,
  requestedMinutes: number
): Record<Workstream, number> {
  const next = { ...allocations };
  const shift = Math.max(0, Math.min(180, Math.round(requestedMinutes)));
  const donors = (Object.keys(next) as Workstream[]).filter((key) => key !== target)
    .sort((a,b) => next[b] - next[a]);
  let moved = 0;
  for (const donor of donors) {
    const available = Math.max(0, next[donor]);
    const taken = Math.min(shift - moved, available);
    next[donor] -= taken;
    moved += taken;
    if (moved >= shift) break;
  }
  next[target] += moved;
  return next;
}
