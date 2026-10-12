export interface FocusActivitySession {
  id: string;
  startedAt: number;
  endedAt: number;
  plannedDurationMs: number;
  actualDurationMs: number;
  overtimeMs: number;
  label: string;
  goalMs: number;
  status: 'completed';
  taskId?: string | null;
  completionKind?: 'full' | 'partial';
}

export type FocusTaskContext = { id: string; title: string };
