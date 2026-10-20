import type { ModuleDataPort } from "./contracts.ts";
import { pomodoroDataPort } from "#lib/modules/pomodoro/adapters/data-port.ts";
import { habitDataPort } from "#lib/modules/habit-tracker/adapters/data-port.ts";
import { learningDataPort } from "#lib/modules/language-learning/adapters/data-port.ts";

/** Explicit feature registration. Do not scan browser databases or import controllers. */
export const globalDataPorts: readonly ModuleDataPort[] = [
  pomodoroDataPort,
  habitDataPort,
  learningDataPort
];
