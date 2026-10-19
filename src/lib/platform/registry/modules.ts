import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

export const modules: ModuleDefinition[] = [
  {
    id: 'habit-tracker',
    name: 'Habit Tracker',
    route: '/habit',
    layout: 'focus',
    status: 'available'
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    route: '/pomodoro',
    layout: 'focus',
    status: 'available'
  }
];

export function getModule(id: string) {
  return modules.find((module) => module.id === id);
}
