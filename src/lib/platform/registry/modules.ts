import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

export const modules: ModuleDefinition[] = [
  {
    id: 'pdf-merge',
    name: 'Merge PDF',
    description: 'Combine PDF files locally in your browser.',
    route: '/pdf/merge',
    layout: 'file-transform'
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    description: 'A focus timer built around reliable temporal state.',
    route: '/pomodoro',
    layout: 'focus'
  },
  {
    id: 'typing',
    name: 'Typing Practice',
    description: 'Practice typing speed and accuracy without setup.',
    route: '/typing',
    layout: 'focus'
  }
];

export function getModule(id: string) {
  return modules.find((module) => module.id === id);
}
