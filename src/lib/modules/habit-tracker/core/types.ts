/** Pure Habit Tracker domain shapes; no browser or persistence dependencies. */
export type LocalDate = string; // Validated, canonical YYYY-MM-DD.
export type HabitDirection = 'BUILD' | 'QUIT';
export type HabitLifecycle = 'ACTIVE' | 'ARCHIVED';
export type Measurement = 'BOOLEAN' | 'COUNT' | 'QUANTITY' | 'DURATION' | 'AVOIDANCE';

export type ScheduleRule =
  | { type: 'DAILY' }
  | { type: 'WEEKDAYS'; weekdays: readonly number[] } // Sunday = 0.
  | { type: 'INTERVAL'; anchorDate: LocalDate; everyDays: number }
  | { type: 'WEEKLY_QUOTA'; daysPerWeek: number }; // Monday–Sunday.

export interface InactiveRange {
  fromDate: LocalDate; // First date without an obligation.
  throughDate?: LocalDate; // Inclusive; absent while archived.
}

export interface HabitDefinition {
  id: string;
  title: string;
  direction: HabitDirection;
  status: HabitLifecycle;
  createdDate: LocalDate;
  /** Explicit history prevents a restore from creating retroactive missed days. */
  inactiveRanges?: readonly InactiveRange[];
}

export interface GoalPolicy {
  id: string;
  habitId: string;
  effectiveFromDate: LocalDate;
  measurement: Measurement;
  target: number;
  unit?: string;
  schedule: ScheduleRule;
}

export interface HabitCheckin {
  habitId: string;
  localDate: LocalDate;
  value?: number;
  attestation?: 'CLEAN' | 'LAPSE';
  skipped?: boolean;
  note?: string;
  recordedAt?: string; // UTC ISO timestamp of the most recent persisted correction.
}

export type DailyOutcome = 'NOT_SCHEDULED' | 'PENDING' | 'PARTIAL' | 'MET' | 'MISSED' | 'SKIPPED';
export type WeeklyOutcome = 'PENDING' | 'MET' | 'MISSED';
export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: readonly string[] };
