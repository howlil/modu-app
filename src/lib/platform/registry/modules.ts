import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

export const modules: ModuleDefinition[] = [
  {
    id: 'pdf-merge',
    name: 'Merge PDF',
    description: 'Combine PDFs locally.',
    route: '/pdf/merge',
    layout: 'file-transform'
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    description: 'Focus timer.',
    route: '/pomodoro',
    layout: 'focus'
  },
  {
    id: 'typing',
    name: 'Typing Practice',
    description: 'Practice speed and accuracy.',
    route: '/typing',
    layout: 'focus'
  }
];

export function getModule(id: string) {
  return modules.find((module) => module.id === id);
}
