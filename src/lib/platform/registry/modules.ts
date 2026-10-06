import type {
  ModuleCategoryDefinition,
  ModuleDefinition
} from '#lib/platform/registry/types.ts';

export const categories: ModuleCategoryDefinition[] = [
  {
    id: 'files',
    name: 'Files',
    description: 'PDF and file utilities.',
    route: '/files'
  },
  {
    id: 'images',
    name: 'Images',
    description: 'Compress and transform images locally.',
    route: '/images'
  },
  {
    id: 'developer',
    name: 'Developer',
    description: 'Formatting, IDs, encoding, and small developer helpers.',
    route: '/developer'
  },
  {
    id: 'productivity',
    name: 'Productivity',
    description: 'Typing, timers, and focused utilities.',
    route: '/productivity'
  }
];

export const modules: ModuleDefinition[] = [
  {
    id: 'pdf-merge',
    name: 'Merge PDF',
    description: 'Combine multiple PDF files locally.',
    route: '/pdf/merge',
    primaryCategory: 'files',
    group: 'pdf',
    keywords: ['merge', 'combine', 'pdf', 'document'],
    tags: ['pdf', 'file'],
    layout: 'file-transform',
    capabilities: ['files', 'worker', 'offline'],
    related: ['pdf-split']
  },
  {
    id: 'pdf-split',
    name: 'Split PDF',
    description: 'Extract pages or split one PDF into ranges.',
    route: '/pdf/split',
    primaryCategory: 'files',
    group: 'pdf',
    keywords: ['split', 'extract', 'pages', 'pdf'],
    tags: ['pdf', 'file'],
    layout: 'file-transform',
    capabilities: ['files', 'worker', 'offline'],
    related: ['pdf-merge']
  },
  {
    id: 'image-compress',
    name: 'Compress Image',
    description: 'Reduce image size in your browser.',
    route: '/image/compress',
    primaryCategory: 'images',
    group: 'image',
    keywords: ['compress', 'image', 'photo', 'size'],
    tags: ['image', 'file'],
    layout: 'file-transform',
    capabilities: ['files', 'worker', 'offline']
  },
  {
    id: 'json-format',
    name: 'Format JSON',
    description: 'Format and validate JSON instantly.',
    route: '/dev/json',
    primaryCategory: 'developer',
    group: 'data',
    keywords: ['json', 'format', 'validate', 'minify'],
    tags: ['developer', 'text'],
    layout: 'text-transform',
    capabilities: ['offline'],
    related: ['uuid']
  },
  {
    id: 'uuid',
    name: 'UUID Generator',
    description: 'Generate UUIDs with no network request.',
    route: '/dev/uuid',
    primaryCategory: 'developer',
    group: 'generator',
    keywords: ['uuid', 'id', 'generator', 'v4', 'v7'],
    tags: ['developer', 'generator'],
    layout: 'generator',
    capabilities: ['offline'],
    related: ['json-format']
  },
  {
    id: 'typing',
    name: 'Typing Practice',
    description: 'Practice speed and accuracy without setup.',
    route: '/typing',
    primaryCategory: 'productivity',
    group: 'practice',
    keywords: ['typing', 'wpm', 'keyboard', 'accuracy'],
    tags: ['productivity', 'practice'],
    layout: 'focus',
    capabilities: ['storage', 'offline'],
    related: ['pomodoro']
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    description: 'A focus timer that survives reloads.',
    route: '/pomodoro',
    primaryCategory: 'productivity',
    group: 'timer',
    keywords: ['pomodoro', 'focus', 'timer', 'break'],
    tags: ['productivity', 'timer'],
    layout: 'focus',
    capabilities: ['storage', 'offline'],
    related: ['typing']
  }
];

export function getModulesByCategory(category: ModuleDefinition['primaryCategory']) {
  return modules.filter((module) => module.primaryCategory === category);
}

export function getModule(id: string) {
  return modules.find((module) => module.id === id);
}
