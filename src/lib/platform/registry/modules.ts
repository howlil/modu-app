import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

export const modules: ModuleDefinition[] = [
  {
    id: 'language-learning',
    name: 'Language Learning',
    route: '/language',
    layout: 'focus',
    status: 'available'
  },
  {
    id: 'habit-tracker',
    name: 'Habit Tracker',
    route: '/habit',
    layout: 'focus',
    status: 'available'
  },
  {
    id: 'brag-document',
    name: 'Career Evidence',
    route: '/brag-document',
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
