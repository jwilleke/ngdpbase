'use strict';

import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import fse from 'fs-extra';

// Access the private seedRequiredPages method via initialize() side-effects.
// We set up a temp required-pages dir and a temp pages dir, then call initialize()
// and assert which files landed in pagesDir.

vi.mock('../../utils/logger', () => ({
  default: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn()

  }
}));

import PageManager from '../PageManager';
import type { WikiEngine } from '../../types/WikiEngine';

// system-category config matching app-default-config.json entries that matter here
const SYSTEM_CATEGORIES = {
  general:       { label: 'general',       storageLocation: 'pages' },
  system:        { label: 'system',        storageLocation: 'required' },
  documentation: { label: 'documentation', storageLocation: 'required' },
  developer:     { label: 'developer',     storageLocation: 'github' },
  addon:         { label: 'addon',         storageLocation: 'pages' }
};

const makeFrontmatter = (title, systemCategory) => {
  const sc = systemCategory ? `system-category: ${systemCategory}\n` : '';
  return `---\ntitle: ${title}\n${sc}---\n\nPage content.\n`;
};

describe('PageManager.seedRequiredPages() — github-only filtering', () => {
  let tmpDir;
  let requiredDir;
  let pagesDir;
  let installCompletePath;

  beforeEach(async () => {
    tmpDir       = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-seed-test-'));
    requiredDir  = path.join(tmpDir, 'required-pages');
    pagesDir     = path.join(tmpDir, 'pages');
    installCompletePath = path.join(tmpDir, '.install-complete');

    await fse.ensureDir(requiredDir);
    await fse.ensureDir(pagesDir);
  });

  afterEach(async () => {
    await fse.remove(tmpDir);
  });

  const makeEngine = (overrides = {}) => {
    const cm = {
      getProperty: vi.fn((key, def) => {
        const map = {
          'ngdpbase.page.enabled':                           true,
          'ngdpbase.page.provider':                          'filesystemprovider',
          'ngdpbase.page.provider.filesystem.storagedir':    pagesDir,
          'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
          'ngdpbase.system-category':                        SYSTEM_CATEGORIES,
          ...overrides
        };
        return map[key] !== undefined ? map[key] : def;
      }),
      getResolvedDataPath: vi.fn((key, def) => {
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        return def;
      })
    };
    return {
      getManager: vi.fn((name) => name === 'ConfigurationManager' ? cm : null)
    };
  };

  const seededFiles = async () => {
    const files = await fs.readdir(pagesDir);
    return files.filter(f => f.endsWith('.md'));
  };

  test('seeds normal (general) pages', async () => {
    await fse.writeFile(
      path.join(requiredDir, 'aaaaaaaa-0000-0000-0000-000000000001.md'),
      makeFrontmatter('Normal Page', 'general')
    );

    const engine = makeEngine();
    await new PageManager(engine).initialize();

    expect(await seededFiles()).toContain('aaaaaaaa-0000-0000-0000-000000000001.md');
  });

  test('skips pages with system-category=developer (storageLocation=github)', async () => {
    await fse.writeFile(
      path.join(requiredDir, 'aaaaaaaa-0000-0000-0000-000000000002.md'),
      makeFrontmatter('Red Link Test', 'developer')
    );

    const engine = makeEngine();
    await new PageManager(engine).initialize();

    expect(await seededFiles()).not.toContain('aaaaaaaa-0000-0000-0000-000000000002.md');
  });

  test('seeds pages with no system-category', async () => {
    await fse.writeFile(
      path.join(requiredDir, 'aaaaaaaa-0000-0000-0000-000000000003.md'),
      makeFrontmatter('No Category Page', null)
    );

    const engine = makeEngine();
    await new PageManager(engine).initialize();

    expect(await seededFiles()).toContain('aaaaaaaa-0000-0000-0000-000000000003.md');
  });

  test('seeds addon pages (storageLocation=pages, not github)', async () => {
    await fse.writeFile(
      path.join(requiredDir, 'aaaaaaaa-0000-0000-0000-000000000004.md'),
      makeFrontmatter('Addon Page', 'addon')
    );

    const engine = makeEngine();
    await new PageManager(engine).initialize();

    expect(await seededFiles()).toContain('aaaaaaaa-0000-0000-0000-000000000004.md');
  });

  test('mixed: seeds normal, skips developer', async () => {
    await fse.writeFile(
      path.join(requiredDir, 'aaaaaaaa-0000-0000-0000-000000000005.md'),
      makeFrontmatter('Normal', 'general')
    );
    await fse.writeFile(
      path.join(requiredDir, 'aaaaaaaa-0000-0000-0000-000000000006.md'),
      makeFrontmatter('Dev Page', 'developer')
    );
    await fse.writeFile(
      path.join(requiredDir, 'aaaaaaaa-0000-0000-0000-000000000007.md'),
      makeFrontmatter('Docs', 'documentation')
    );

    const engine = makeEngine();
    await new PageManager(engine).initialize();

    const files = await seededFiles();
    expect(files).toContain('aaaaaaaa-0000-0000-0000-000000000005.md');
    expect(files).not.toContain('aaaaaaaa-0000-0000-0000-000000000006.md');
    expect(files).toContain('aaaaaaaa-0000-0000-0000-000000000007.md');
  });

  test('install-complete guard still skips seeding when pages already exist', async () => {
    await fse.writeFile(installCompletePath, '');
    await fse.writeFile(path.join(pagesDir, 'existing.md'), '# existing');
    await fse.writeFile(
      path.join(requiredDir, 'aaaaaaaa-0000-0000-0000-000000000008.md'),
      makeFrontmatter('New Page', 'general')
    );

    const engine = makeEngine();
    await new PageManager(engine).initialize();

    // Should not seed the new page when install is complete and pages exist
    expect(await seededFiles()).not.toContain('aaaaaaaa-0000-0000-0000-000000000008.md');
  });

  test('respects custom github-only category beyond developer', async () => {
    const customCategories = {
      ...SYSTEM_CATEGORIES,
      'internal-only': { label: 'internal-only', storageLocation: 'github' }
    };

    await fse.writeFile(
      path.join(requiredDir, 'aaaaaaaa-0000-0000-0000-000000000009.md'),
      makeFrontmatter('Internal Page', 'internal-only')
    );

    const engine = makeEngine({ 'ngdpbase.system-category': customCategories });
    await new PageManager(engine).initialize();

    expect(await seededFiles()).not.toContain('aaaaaaaa-0000-0000-0000-000000000009.md');
  });
});
