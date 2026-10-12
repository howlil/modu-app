import type { FocusActivitySession } from '#lib/shared/focus-sessions/types.ts';
import type { ExecutionTask, ManualWorkEntry, Workstream } from './planning.ts';
import { WORKSTREAM_NAMES, localDayKey } from './planning.ts';
import type { EvidenceRecord } from './evidence.ts';

export type MetricWindow = 7 | 28 | 90;
export interface DayActivity {
  dateKey: string;
  focusMs: number;
  manualMs: number;
}
export interface IntelligenceSnapshot {
  from: number;
  to: number;
  focusMs: number;
  manualMs: number;
  totalMs: number;
  completedTasks: number;
  evidenceCount: number;
  activeDays: number;
  unassignedSessions: number;
  workstreamMs: Record<Workstream, number>;
  daily: DayActivity[];
  limitations: string[];
}

export function localWindow(days: MetricWindow, now: number): { from: number; to: number } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  return { from: start.getTime(), to: end.getTime() };
}

export function buildIntelligenceSnapshot(
  focusSessions: FocusActivitySession[],
  manualEntries: ManualWorkEntry[],
  tasks: ExecutionTask[],
  evidence: EvidenceRecord[],
  from: number,
  to: number
): IntelligenceSnapshot {
  const focus = focusSessions.filter((entry) => entry.endedAt >= from && entry.endedAt < to);
  const manual = manualEntries.filter((entry) => entry.endedAt >= from && entry.endedAt < to);
  const taskAreas = new Map(tasks.map((task) => [task.id, task.workstream]));
  const workstreamMs = Object.fromEntries(Object.keys(WORKSTREAM_NAMES).map((key) => [key, 0])) as Record<Workstream, number>;
  const dayMap = new Map<string, DayActivity>();
  for (let cursor = new Date(from); cursor.getTime() < to; cursor.setDate(cursor.getDate() + 1)) {
    const dateKey = localDayKey(cursor.getTime());
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, { dateKey, focusMs: 0, manualMs: 0 });
  }
  for (const record of focus) {
    const duration = Math.max(0, record.actualDurationMs);
    const day = dayMap.get(localDayKey(record.endedAt));
    if (day) day.focusMs += duration;
    const workstream = record.taskId ? taskAreas.get(record.taskId) : undefined;
    if (workstream) workstreamMs[workstream] += duration;
  }
  for (const entry of manual) {
    const duration = Math.max(0, entry.endedAt - entry.startedAt);
    const day = dayMap.get(localDayKey(entry.endedAt));
    if (day) day.manualMs += duration;
    const workstream = entry.taskId ? taskAreas.get(entry.taskId) : undefined;
    if (workstream) workstreamMs[workstream] += duration;
  }
  const daily = [...dayMap.values()];
  const focusMs = focus.reduce((sum, entry) => sum + Math.max(0, entry.actualDurationMs), 0);
  const manualMs = manual.reduce((sum, entry) => sum + Math.max(0, entry.endedAt - entry.startedAt), 0);
  const crossDay = focus.some((entry) => localDayKey(entry.startedAt) !== localDayKey(entry.endedAt)) ||
    manual.some((entry) => localDayKey(entry.startedAt) !== localDayKey(entry.endedAt));
  return {
    from, to, focusMs, manualMs, totalMs: focusMs + manualMs,
    completedTasks: tasks.filter((task) => task.status === 'done' && typeof task.completedAt === 'number' &&
      task.completedAt >= from && task.completedAt < to).length,
    evidenceCount: new Set(evidence.filter((record) => record.occurredAt >= from && record.occurredAt < to).map((record) => record.id)).size,
    activeDays: daily.filter((day) => day.focusMs + day.manualMs > 0).length,
    unassignedSessions: focus.filter((record) => !record.taskId || !taskAreas.has(record.taskId)).length,
    workstreamMs, daily,
    limitations: [
      ...(crossDay ? ['Cross-midnight sessions are attributed to their completion day; exact active intervals were not recorded for every legacy session.'] : []),
      ...(focus.some((record) => !record.completionKind) ? ['Some legacy focus sessions do not distinguish partial from full completion.'] : [])
    ]
  };
}
