/**
 * #1503 — a system-category's `source` (site | shipped | repo) is removed. Each
 * of its jobs moved to what docs/system-category.md ("Where a page's master
 * copy lives") names: where a system-category's pages are stored is its
 * `storageLocation` (none / public / vault), and whether a page is a shipped
 * copy is decided per page.
 *
 * #1988: a site or add-on config that still carries `source` is ignored
 * without a warning per category.
 *
 * The guards at the bottom fail if code reads `source` off a system category
 * again, or compares `storageLocation` to one of its old words.
 */
import fs from 'fs';
import path from 'path';
import ValidationManager, { categoryStored } from '../ValidationManager';
import logger from '../../utils/logger';
import type { WikiEngine } from '../../types/WikiEngine';

const SHIPPED_CONFIG = path.join(process.cwd(), 'config', 'app-default-config.json');
const JOURNAL_CONFIG = path.join(process.cwd(), 'addons', 'journal', 'config', 'default-config.json');

function managerWith(categories: Record<string, unknown>): ValidationManager {
  const configManager = { getProperty: (key: string, def: unknown) => (key === 'ngdpbase.system-category' ? categories : def) };
  const engine = { getManager: () => configManager } as unknown as WikiEngine;
  const vm = new ValidationManager(engine);
  vm.loadSystemCategories(configManager);
  return vm;
}

const VAULT = { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' };

describe('categoryStored (#1503)', () => {
  test('no storageLocation: never stored on the site', () => {
    expect(categoryStored({})).toBe('none');
    expect(categoryStored(null)).toBe('none');
  });

  test('a storageLocation without a vault: public only', () => {
    expect(categoryStored({ storageLocation: { defaultstore: 'pages/' } })).toBe('public');
  });

  test('a storageLocation that is present but not the pair of folders still stores, so a stale config never refuses saves', () => {
    expect(categoryStored({ storageLocation: 'regular' })).toBe('public');
    expect(categoryStored({ storageLocation: { privatestore: 'nonsense' } })).toBe('public');
  });

  test('a privatestore: a vault', () => {
    expect(categoryStored({ storageLocation: VAULT })).toBe('vault');
  });

  test('a leftover source changes nothing', () => {
    expect(categoryStored({ source: 'repo', storageLocation: VAULT })).toBe('vault');
    expect(categoryStored({ source: 'shipped', storageLocation: VAULT })).toBe('vault');
    expect(categoryStored({ source: 'site' })).toBe('none');
  });
});

describe('ValidationManager.getCategoryStored (#1503)', () => {
  const vm = managerWith({
    general: { label: 'general', default: true, storageLocation: VAULT },
    system: { label: 'system', storageLocation: { defaultstore: 'pages/' } },
    developer: { label: 'developer', enabled: false }
  });

  test('looks the system-category up by label, case-insensitively', () => {
    expect(vm.getCategoryStored('General')).toBe('vault');
    expect(vm.getCategoryStored('System')).toBe('public');
    expect(vm.getCategoryStored('developer')).toBe('none');
  });

  test('an unknown system-category has no answer, so nothing is refused for it', () => {
    expect(vm.getCategoryStored('nope')).toBeNull();
  });
});

describe('a leftover source in a site config is ignored (#1988)', () => {
  const logged = (categories: Record<string, unknown>): { warn: string[]; info: string[] } => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const info = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    try {
      managerWith(categories);
      return {
        warn: warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('source')),
        info: info.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('source'))
      };
    } finally {
      warn.mockRestore();
      info.mockRestore();
    }
  };

  test('no source: nothing logged', () => {
    expect(logged({ phr: { label: 'phr', default: true, storageLocation: VAULT } })).toEqual({ warn: [], info: [] });
  });

  test('every entry carrying source, valid or not: no warning, one info line naming them all', () => {
    const out = logged({
      general: { label: 'general', source: 'site', default: true, storageLocation: VAULT },
      system: { label: 'system', source: 'shipped', storageLocation: { defaultstore: 'pages/' } },
      old: { label: 'old', source: 'required', storageLocation: { defaultstore: 'pages/' } }
    });
    expect(out.warn).toEqual([]);
    expect(out.info).toHaveLength(1);
    expect(out.info[0]).toContain('general, system, old');
  });

  test('an enabled entry with no storageLocation warns once, naming each; a disabled one is silent', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    try {
      managerWith({
        general: { label: 'general', default: true, storageLocation: VAULT },
        mine: { label: 'mine' },
        theirs: { label: 'theirs', enabled: true },
        developer: { label: 'developer', enabled: false }
      });
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('no storageLocation'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('mine, theirs');
      expect(lines[0]).not.toContain('developer');
    } finally {
      warn.mockRestore();
    }
  });

  test("a leftover source: 'repo' does not stop the pages being stored", () => {
    const vm = managerWith({ notes: { label: 'notes', source: 'repo', default: true, storageLocation: VAULT } });
    expect(vm.getCategoryStored('notes')).toBe('vault');
    expect(vm.canBePrivate('notes')).toBe(true);
  });
});

describe('shipped system-categories carry no source (#1503)', () => {
  const read = (file: string) => (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>)['ngdpbase.system-category'] as
    Record<string, Record<string, unknown>>;
  const core = read(SHIPPED_CONFIG);
  const journal = read(JOURNAL_CONFIG);

  test('no entry in core or the journal add-on carries source, and none carries an old storageLocation word', () => {
    for (const [key, cfg] of Object.entries({ ...core, ...journal })) {
      expect({ key, hasSource: 'source' in cfg }).toEqual({ key, hasSource: false });
      expect({ key, isWord: typeof cfg.storageLocation === 'string' }).toEqual({ key, isWord: false });
    }
  });

  test('matches docs/system-category.md: developer is never stored, general and capture have vaults, the rest are public', () => {
    const stored = Object.fromEntries(Object.entries({ ...core, ...journal }).map(([k, c]) => [k, categoryStored(c)]));
    expect(stored).toEqual({
      general: 'vault', system: 'public', documentation: 'public', developer: 'none',
      addon: 'public', 'user-profile': 'public', capture: 'vault', journal: 'vault'
    });
  });
});

describe('guards (#1503)', () => {
  const ROOTS = ['src', 'addons', 'scripts'];
  const EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'];

  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'dist', '__tests__', 'coverage'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext)) && !entry.name.endsWith('.d.ts') && !/\.test\.|\.spec\./.test(entry.name)) out.push(full);
      }
    };
    for (const root of ROOTS) {
      const dir = path.join(process.cwd(), root);
      if (fs.existsSync(dir)) walk(dir);
    }
    return out;
  }

  function offenders(pattern: RegExp, onlyFilesMatching?: RegExp): string[] {
    const found: string[] = [];
    for (const file of sourceFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      if (onlyFilesMatching && !onlyFilesMatching.test(text)) continue;
      text.split('\n').forEach((line, i) => {
        if (pattern.test(line)) found.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
      });
    }
    return found;
  }

  test('no code reads source off a system category', () => {
    // The removed helpers, anywhere.
    expect(offenders(/\b(categorySource|getCategorySource|CategorySource)\b/)).toEqual([]);
    // In code that reads system-categories: a `.source` / `['source']` read off
    // an entry, or a `source` field declared on one. ValidationManager's one
    // `'source' in` check, which only notices a leftover to ignore it, is not a read.
    const ENTRY_READ = /\b(cfg|config|categoryConfig|catConfig|cat|c|e|entry|category|value)\??\.source\b|\[\s*['"]source['"]\s*\]|\bsource\?\s*:\s*(string|['"](site|shipped|repo)['"])/;
    expect(offenders(ENTRY_READ, /system-category|SYSTEM_CATEGORY_KEY|systemCategor/)).toEqual([]);
  });

  test('no code compares storageLocation to an old word (regular / required / github)', () => {
    const OLD_WORD = /storageLocation[^\n]{0,60}['"](regular|required|github)['"]|['"](regular|required|github)['"][^\n]{0,20}storageLocation/;
    expect(offenders(OLD_WORD)).toEqual([]);
  });
});
