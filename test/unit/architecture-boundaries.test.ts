import { describe, expect, it } from 'vitest';

const sources = {
  ...import.meta.glob<string>('../../src/lib/modules/**/*.{ts,svelte}', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../../src/lib/components/ui/**/*.{ts,svelte}', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../../src/routes/pomodoro/+page.svelte', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../../extension/content-bridge.js', { eager: true, query: '?raw', import: 'default' })
};

function read(path: string) {
  const match = Object.entries(sources).find(([source]) => source.endsWith('/' + path));
  if (!match) throw new Error('Architecture test source missing: ' + path);
  return match[1];
}

function sourceFiles(folder: string) {
  return Object.keys(sources).filter((path) => path.includes('/' + folder + '/'));
}

function importedPaths(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)]
    .map((result) => result[1]);
}

describe('Module boundary rules', () => {
  it('keeps Pomodoro route thin and feature-owned', () => {
    const route = read('src/routes/pomodoro/+page.svelte');
    expect(route).toContain('PomodoroWorkspace');
    expect(route.split('\n').length).toBeLessThan(35);
    expect(route).not.toMatch(/\$state\s*\(|\bonMount\s*\(|\blocalStorage\b|\bindexedDB\b/);
  });

  it('keeps pure domain transitions browser-free', () => {
    for (const file of [
      'src/lib/modules/pomodoro/timer.ts',
      'src/lib/modules/pomodoro/activity.ts',
      'src/lib/modules/typing/trainer.ts',
      'src/lib/modules/typing/session.ts'
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/\b(localStorage|indexedDB|window|document|AudioContext|chrome)\b/);
      expect(importedPaths(source), file).not.toContainEqual(expect.stringMatching(/\/components\/|\/controller\/|\/adapters\/|\/server\/|\/routes\//));
    }
  });

  it('disallows cross-feature and server imports from feature modules', () => {
    for (const file of sourceFiles('src/lib/modules')) {
      const owner = file.split('/src/lib/modules/')[1]?.split('/')[0];
      for (const imported of importedPaths(read(file))) {
        const found = imported.match(/(?:#lib|\$lib)\/modules\/([^/]+)/);
        if (found) expect(found[1], file + ' imports ' + imported).toBe(owner);
        expect(imported, file).not.toMatch(/(?:#lib|\$lib)\/server\//);
      }
    }
  });

  it('does not make shared shadcn primitives feature-aware', () => {
    for (const file of sourceFiles('src/lib/components/ui')) {
      expect(read(file), file).not.toMatch(/(?:#lib|\$lib)\/(?:modules|server)\//);
    }
  });

  it('instantiates reactive state in a controller factory without importing feature views', () => {
    const controller = read('src/lib/modules/pomodoro/controller/pomodoro.svelte.ts');
    expect(controller).toContain('export function createPomodoroController()');
    expect(controller).not.toMatch(/export const controller\s*=|import .*\.svelte['"]/);
  });

  it('keeps browser and extension bridge message labels aligned', () => {
    const web = read('src/lib/modules/pomodoro/focus-protection.ts');
    const extension = read('extension/content-bridge.js');
    for (const key of ['REQUEST_TYPE', 'RESPONSE_TYPE', 'WEB_SOURCE', 'EXTENSION_SOURCE']) {
      const rx = new RegExp('const ' + key + " = '([^']+)'");
      const expected = web.match(rx)?.[1];
      expect(expected, key).toBeTruthy();
      expect(extension.match(rx)?.[1], key).toBe(expected);
    }
  });
});
