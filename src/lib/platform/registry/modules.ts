import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

export const modules: ModuleDefinition[] = [
  {
    id: 'pdf-merge',
    name: 'Merge PDF',
    route: '/pdf/merge',
    layout: 'file-transform',
    status: 'coming-soon'
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    route: '/pomodoro',
    layout: 'focus',
    status: 'available'
  },
  {
    id: 'typing',
    name: 'Typing Practice',
    route: '/typing',
    layout: 'focus',
    status: 'available'
  },
  {
    id: 'image-compress',
    name: 'Image Compress',
    route: '#',
    layout: 'file-transform',
    status: 'coming-soon'
  }
];

export function getModule(id: string) {
  return modules.find((module) => module.id === id);
}
