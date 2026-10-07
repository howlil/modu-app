import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

export const modules: ModuleDefinition[] = [
  {
    id: 'pdf-merge',
    name: 'Merge PDF',
    route: '/pdf/merge',
    layout: 'file-transform'
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    route: '/pomodoro',
    layout: 'focus'
  },
  {
    id: 'typing',
    name: 'Typing Practice',
    route: '/typing',
    layout: 'focus'
  }
];

export function getModule(id: string) {
  return modules.find((module) => module.id === id);
}
