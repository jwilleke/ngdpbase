/**
 * #1503 — a category's `source` (site | shipped | repo) replaces the old
 * `storageLocation` words (regular | required | github) one for one.
 *
 * The guard at the bottom fails if any code still compares `storageLocation`
 * to one of the old words: `storageLocation` is about to become a place (#1504),
 * so nothing may keep reading it as the switch.
 */
import fs from 'fs';
import path from 'path';
import ValidationManager, { categorySource } from '../ValidationManager';
import type { WikiEngine } from '../../types/WikiEngine';

const SHIPPED_CONFIG = path.join(process.cwd(), 'config', 'app-default-config.json');

function managerWith(categories: Record<string, unknown>): ValidationManager {
  const configManager = { getProperty: (key: string, def: unknown) => (key === 'ngdpbase.system-category' ? categories : def) };
  const engine = { getManager: () => configManager } as unknown as WikiEngine;
  const vm = new ValidationManager(engine);
  vm.loadSystemCategories(configManager);
  return vm;
}

describe('categorySource (#1503)', () => {
  test('returns the declared source', () => {
    expect(categorySource({ source: 'site' })).toBe('site');
    expect(categorySource({ source: 'shipped' })).toBe('shipped');
    expect(categorySource({ source: 'repo' })).toBe('repo');
  });

  test('an entry without a valid source is a site category', () => {
    expect(categorySource({})).toBe('site');
    expect(categorySource(null)).toBe('site');
    expect(categorySource({ source: 'required' })).toBe('site');
  });
});

describe('ValidationManager.getCategorySource (#1503)', () => {
  const vm = managerWith({
    general: { label: 'general', source: 'site', default: true },
    system: { label: 'system', source: 'shipped' },
    developer: { label: 'developer', source: 'repo', enabled: false }
  });

  test('looks the category up by label, case-insensitively', () => {
    expect(vm.getCategorySource('System')).toBe('shipped');
    expect(vm.getCategorySource('developer')).toBe('repo');
    expect(vm.getCategorySource('general')).toBe('site');
  });

  test('an unknown category is a site category', () => {
    expect(vm.getCategorySource('nope')).toBe('site');
  });
});

describe('shipped categories declare their source (#1503)', () => {
  const config = JSON.parse(fs.readFileSync(SHIPPED_CONFIG, 'utf8')) as Record<string, unknown>;
  const categories = config['ngdpbase.system-category'] as Record<string, { source?: string; storageLocation?: unknown }>;

  test('every entry carries source, and none carries an old storageLocation word', () => {
    for (const [key, cfg] of Object.entries(categories)) {
      expect({ key, source: cfg.source }).toEqual({ key, source: expect.stringMatching(/^(site|shipped|repo)$/) as unknown });
      expect({ key, storageLocation: cfg.storageLocation }).toEqual({ key, storageLocation: undefined });
    }
  });

  test('system and documentation are shipped, developer is repo, the rest are site', () => {
    const sources = Object.fromEntries(Object.entries(categories).map(([k, c]) => [k, c.source]));
    expect(sources).toMatchObject({
      general: 'site', system: 'shipped', documentation: 'shipped', developer: 'repo',
      addon: 'site', 'user-profile': 'site', journal: 'site'
    });
  });
});

describe('guard: no code compares storageLocation to an old word (#1503)', () => {
  const ROOTS = ['src', 'addons', 'scripts'];
  const OLD_WORD = /storageLocation[^\n]{0,60}['"](regular|required|github)['"]|['"](regular|required|github)['"][^\n]{0,20}storageLocation/;

  function walk(dir: string, out: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
    }
  }

  test('no source file branches on regular / required / github through storageLocation', () => {
    const files: string[] = [];
    for (const root of ROOTS) walk(path.join(process.cwd(), root), files);
    const offenders: string[] = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (OLD_WORD.test(line)) offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
