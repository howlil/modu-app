import { describe, expect, it } from 'vitest';

const sources = {
  ...import.meta.glob<string>('../../src/lib/modules/**/*.{ts,svelte}', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../../src/lib/components/ui/**/*.{ts,svelte}', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../../src/routes/{pomodoro,typing}/+page.svelte', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob<string>('../../extension/content-bridge.js', { eager: true, query: '?raw', import: 'default' })
};

function read(path: string) {
  const match = Object.entries(sources).find(([source]) => source === path || source.endsWith('/' + path));
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
  it('requires every implemented feature to follow the canonical folder layout', () => {
    const files = sourceFiles('src/lib/modules');
    const names = [...new Set(files.map((file) => file.match(/\/src\/lib\/modules\/([^/]+)\//)?.[1]).filter((name): name is string => Boolean(name)))];

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const prefix = '/src/lib/modules/' + name + '/';
      const local = files.filter((file) => file.includes(prefix)).map((file) => file.split(prefix)[1]);
      const root = local.filter((file) => !file.includes('/'));
      expect(root, name + ': root must contain only a workspace').toHaveLength(1);
      expect(root[0], name + ': workspace is the only feature-root source').toMatch(/^[A-Z][A-Za-z0-9]*Workspace\.svelte$/);

      for (const folder of ['core', 'adapters', 'controller', 'components']) {
        expect(local.some((file) => file.startsWith(folder + '/')), name + ': missing ' + folder + '/').toBe(true);
      }
      for (const file of local) {
        if (!file.includes('/')) continue;
        const owner = file.split('/')[0];
        expect(['core', 'adapters', 'controller', 'components'], name + ': unexpected folder ' + file).toContain(owner);
        if (owner === 'core') expect(file, name + ': core must be TypeScript').toMatch(/^core\/.*\.ts$/);
        if (owner === 'adapters') expect(file, name + ': adapters must be TypeScript').toMatch(/^adapters\/.*\.ts$/);
        if (owner === 'controller') expect(file, name + ': controller must use Svelte 5 runes').toMatch(/^controller\/.*\.svelte\.ts$/);
        if (owner === 'components') expect(file, name + ': UI components must use Svelte').toMatch(/^components\/.*\.svelte$/);
      }
    }
  });

  it('enforces inward-only dependencies in every feature, including future ones', () => {
    const files = sourceFiles('src/lib/modules');
    for (const path of files) {
      const part = path.match(/\/src\/lib\/modules\/([^/]+)\/(core|adapters|controller|components)\//);
      if (!part) continue;
      const owner = part[1];
      const layer = part[2];
      const content = read(path);
      const imports = importedPaths(content);
      const ownOtherLayers = imports.filter((target) => target.includes('/modules/' + owner + '/') || target.startsWith('../') || target.startsWith('./'));
      if (layer === 'core') {
        expect(ownOtherLayers, path + ': pure core cannot import UI, controller, adapters or server').not.toContainEqual(expect.stringMatching(/(?:^|\/)(?:adapters|controller|components|server|routes)\//));
        expect(content, path + ': domain must be browser-free').not.toMatch(/\b(localStorage|indexedDB|window|document|AudioContext|chrome)\b/);
      }
      if (layer === 'adapters') {
        expect(ownOtherLayers, path + ': adapters cannot import UI/controllers').not.toContainEqual(expect.stringMatching(/(?:^|\/)(?:controller|components)\/|\.svelte(?:\.ts)?$/));
      }
      if (layer === 'controller') {
        expect(ownOtherLayers, path + ': controller cannot import presentation').not.toContainEqual(expect.stringMatching(/(?:^|\/)components\/|\.svelte$/));
        const factoryAt = content.search(/export function create[A-Za-z0-9]+Controller\s*\(/);
        expect(factoryAt, path + ': export a controller factory').toBeGreaterThanOrEqual(0);
        expect(content.slice(0, factoryAt), path + ': do not initialize shared rune state outside the factory').not.toMatch(/\$state\s*\(/);
      }
    }
  });

  it('keeps Pomodoro route thin and feature-owned', () => {
    const route = read('src/routes/pomodoro/+page.svelte');
    expect(route).toContain('PomodoroWorkspace');
    expect(route.split('\n').length).toBeLessThan(35);
    expect(route).not.toMatch(/\$state\s*\(|\bonMount\s*\(|\blocalStorage\b|\bindexedDB\b/);
  });

  it('keeps the Typing route thin and composed through its feature workspace', () => {
    const route = read('src/routes/typing/+page.svelte');
    expect(route).toContain('TypingWorkspace');
    expect(route.split('\n').length).toBeLessThan(35);
    expect(route).not.toMatch(/\$state\s*\(|\bonMount\s*\(|\blocalStorage\b|\baddEventListener\b/);
  });

  it('keeps pure domain transitions browser-free', () => {
    for (const file of [
      'src/lib/modules/pomodoro/core/timer.ts',
      'src/lib/modules/pomodoro/core/activity.ts',
      'src/lib/modules/typing/core/trainer.ts',
      'src/lib/modules/typing/core/session.ts'
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

  it('keeps Pomodoro pure core and browser adapters physically separated', () => {
    const domain = [
      'src/lib/modules/pomodoro/core/timer.ts',
      'src/lib/modules/pomodoro/core/activity.ts'
    ];
    const adapters = [
      'src/lib/modules/pomodoro/adapters/persistence.ts',
      'src/lib/modules/pomodoro/adapters/activity-storage.ts',
      'src/lib/modules/pomodoro/adapters/focus-protection.ts',
      'src/lib/modules/pomodoro/adapters/sounds.ts',
      'src/lib/modules/pomodoro/adapters/wake-lock.ts'
    ];
    const oldPaths = ['timer', 'activity', 'persistence', 'activity-storage', 'focus-protection', 'sounds', 'wake-lock']
      .map((file) => 'src/lib/modules/pomodoro/' + file + '.ts');

    for (const path of [...domain, ...adapters]) expect(read(path), path).toBeTruthy();
    for (const path of oldPaths) expect(sourceFiles('src/lib/modules/pomodoro').some((file) => file.endsWith('/' + path)), path).toBe(false);

    for (const path of domain) {
      const source = read(path);
      expect(importedPaths(source), path).not.toContainEqual(expect.stringMatching(/adapters|storage|controller|components|routes|server/));
      expect(source, path).not.toMatch(/\b(localStorage|indexedDB|window|document|AudioContext|chrome)\b/);
    }
    for (const path of adapters) {
      expect(importedPaths(read(path)), path).not.toContainEqual(expect.stringMatching(/(?:\/components\/|\/controller\/|\.svelte(?:\.ts)?$)/));
    }
    expect(read('src/lib/modules/pomodoro/controller/pomodoro.svelte.ts'))
      .toContain('#lib/modules/pomodoro/adapters/activity-storage.ts');
  });

  it('keeps Typing domain, adapters, and presentation separated', () => {
    const core = [
      'src/lib/modules/typing/core/trainer.ts',
      'src/lib/modules/typing/core/session.ts'
    ];
    const adapters = [
      'src/lib/modules/typing/adapters/persistence.ts',
      'src/lib/modules/typing/adapters/sounds.ts'
    ];
    const oldPaths = ['trainer', 'session', 'persistence', 'sounds']
      .map((name) => 'src/lib/modules/typing/' + name + '.ts');

    for (const file of [...core, ...adapters]) expect(read(file), file).toBeTruthy();
    for (const file of oldPaths) {
      expect(sourceFiles('src/lib/modules/typing').some((source) => source.endsWith('/' + file)), file).toBe(false);
    }

    for (const file of core) {
      const text = read(file);
      expect(importedPaths(text), file).not.toContainEqual(expect.stringMatching(/adapters|controller|components|server|routes/));
      expect(text, file).not.toMatch(/\b(localStorage|indexedDB|window|document|AudioContext|chrome)\b/);
    }
    for (const file of adapters) {
      expect(importedPaths(read(file)), file).not.toContainEqual(expect.stringMatching(/\/components\/|\/controller\/|\.svelte(?:\.ts)?$/));
    }

    const controller = read('src/lib/modules/typing/controller/typing.svelte.ts');
    const workspace = read('src/lib/modules/typing/TypingWorkspace.svelte');
    expect(controller).toContain('export function createTypingController()');
    expect(controller).not.toMatch(/export const controller\s*=|import .*\.svelte['"]/);
    expect(workspace).toContain('const controller = createTypingController()');
    expect(workspace).toContain('bind:value={controller.primaryTab}');
    expect(workspace).toContain('bind:this={controller.trainingSurface}');
    expect(controller).toContain("window.addEventListener('keydown', handleKeyDown)");
    for (const file of sourceFiles('src/lib/modules/typing')) {
      expect(importedPaths(read(file)), file).not.toContainEqual(expect.stringMatching(/\.\.\/(?:trainer|session|sounds|persistence)\.ts$/));
    }
  });

  it('keeps browser and extension bridge message labels aligned', () => {
    const web = read('src/lib/modules/pomodoro/adapters/focus-protection.ts');
    const extension = read('extension/content-bridge.js');
    for (const key of ['REQUEST_TYPE', 'RESPONSE_TYPE', 'WEB_SOURCE', 'EXTENSION_SOURCE']) {
      const rx = new RegExp('const ' + key + " = '([^']+)'");
      const expected = web.match(rx)?.[1];
      expect(expected, key).toBeTruthy();
      expect(extension.match(rx)?.[1], key).toBe(expected);
    }
  });
});
