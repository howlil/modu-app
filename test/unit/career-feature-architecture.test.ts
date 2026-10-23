import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../src/lib/modules/brag-document/', import.meta.url));
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('Career Evidence feature boundary', () => {
  it('has the mandatory feature layout with a single root workspace', () => {
    const names = readdirSync(ROOT).sort();
    expect(names).toEqual([
      'BragDocumentWorkspace.svelte', 'adapters', 'components', 'controller', 'core'
    ]);
  });
  it('keeps browser storage out of deterministic core algorithms', () => {
    for (const name of readdirSync(join(ROOT, 'core'))) {
      if (!name.endsWith('.ts')) continue;
      const code = source('core/' + name);
      expect(code).not.toMatch(/from\s+['"]\.\.\/(adapters|controller|components)\//);
      expect(code).not.toMatch(/\b(?:indexedDB|localStorage|window|document)\s*\./);
    }
  });
  it('keeps UI composition away from raw IDB APIs', () => {
    for (const dir of ['components', '.']) {
      for (const name of readdirSync(join(ROOT, dir))) {
        if (!name.endsWith('.svelte')) continue;
        const code = source(join(dir, name));
        expect(code).not.toMatch(/\bindexedDB\s*\./);
        expect(code).not.toMatch(/from\s+['"]\.\.\/adapters\/persistence/);
      }
    }
    const route = readFileSync(fileURLToPath(
      new URL('../../src/routes/brag-document/+page.svelte', import.meta.url)
    ), 'utf8');
    expect(route).toContain('BragDocumentWorkspace');
    expect(route).not.toContain('indexedDB');
  });
});
