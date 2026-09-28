/**
 * #1504 — startup refuses a system-category config that could put private
 * pages in the wrong place (operator, 2026-09-28).
 */
import fs from 'fs';
import path from 'path';
import ValidationManager, { systemCategoryConfigProblems } from '../ValidationManager';
import type { WikiEngine } from '../../types/WikiEngine';

const vault = (privatestore: string, extra: Record<string, unknown> = {}) => ({
  label: 'x', storageLocation: { defaultstore: 'pages/', privatestore }, ...extra
});

describe('systemCategoryConfigProblems (#1504)', () => {
  test('the shipped configuration has no problems', () => {
    const shipped = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')) as Record<string, unknown>;
    expect(systemCategoryConfigProblems(shipped['ngdpbase.system-category'])).toEqual([]);
  });

  test('exactly one default', () => {
    expect(systemCategoryConfigProblems({ a: { label: 'a' } })).toEqual([expect.stringMatching(/exactly one.*default.*none/i)]);
    expect(systemCategoryConfigProblems({ a: { label: 'a', default: true }, b: { label: 'b', default: true } }))
      .toEqual([expect.stringMatching(/exactly one.*default.*a, b/i)]);
  });

  test('a privatestore that is not pages/<parent>/{user}/<vault id>/ is named', () => {
    expect(systemCategoryConfigProblems({ general: vault('pages/vaults/default/', { default: true }) }))
      .toEqual([expect.stringMatching(/general.*privatestore/)]);
  });

  test('two system-categories may not share a vault', () => {
    expect(systemCategoryConfigProblems({
      general: vault('pages/vaults/{user}/default/', { default: true }),
      journal: vault('pages/vaults/{user}/default/')
    })).toEqual([expect.stringMatching(/general, journal.*share.*default/)]);
  });

  test('every vault has the same parent folder', () => {
    expect(systemCategoryConfigProblems({
      general: vault('pages/vaults/{user}/default/', { default: true }),
      journal: vault('pages/private/{user}/journal/')
    })).toEqual([expect.stringMatching(/one parent folder.*vaults.*private/)]);
  });
});

describe('ValidationManager refuses to start on a bad system-category config (#1504)', () => {
  test('initialize throws, naming the problem', async () => {
    const configManager = { getProperty: (key: string, def: unknown) => (key === 'ngdpbase.system-category' ? { a: { label: 'a' } } : def) };
    const engine = { getManager: () => configManager } as unknown as WikiEngine;
    await expect(new ValidationManager(engine).initialize()).rejects.toThrow(/exactly one.*default/i);
  });
});
