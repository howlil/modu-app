import { describe, expect, it } from 'vitest';
import { getModule, modules } from '../../src/lib/platform/registry/modules.ts';

const pages = import.meta.glob<string>('../../src/routes/**/+page.svelte', {
  eager: true, query: '?raw', import: 'default'
});

describe('Landing module registry', () => {
  it('exposes all current modules without duplicate routes', () => {
    expect(modules.map(module => module.id)).toEqual([
      'language-learning', 'habit-tracker', 'pomodoro'
    ]);
    expect(new Set(modules.map(module => module.route)).size).toBe(modules.length);
    expect(modules.every(module => module.status === 'available')).toBe(true);
    expect(getModule('language-learning')?.route).toBe('/language');
  });

  it('each available landing card targets an implemented route and workspace', () => {
    for (const module of modules.filter(module => module.status === 'available')) {
      const route = '../../src/routes' + module.route + '/+page.svelte';
      expect(pages[route], module.id + ': missing SvelteKit route').toBeTruthy();
      expect(pages[route], module.id + ': route must render its workspace').toContain('Workspace');
    }
  });
});
