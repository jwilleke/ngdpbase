/**
 * #1503: a system-category with no `storageLocation` is never stored on the
 * site (its pages live in the repository's docs/), so a save is refused. That
 * used to be `source: 'repo'`; a leftover `source` is now ignored.
 */

vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import ValidationManager from '../../managers/ValidationManager';
import { TEST_ACTOR } from '../../test-support/actors';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const UUID = '33333333-3333-4333-8333-333333333333';

describe('a system-category with no storageLocation is never stored (#1503)', () => {
  let testDir: string;
  let pagesDir: string;
  let provider: VersioningFileProvider;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-never-stored-'));
    pagesDir = path.join(testDir, 'pages');
    const indexPath = path.join(testDir, 'data', 'page-index.json');
    const config: Record<string, unknown> = {
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
      'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
      'ngdpbase.page.provider.versioning.indexfile': indexPath,
      'ngdpbase.system-category': {
        general: { label: 'general', default: true, storageLocation: { defaultstore: 'pages/' } },
        developer: { label: 'developer', enabled: false },
        // A site config left from before #1503: the word no longer decides anything.
        notes: { label: 'notes', source: 'repo', storageLocation: { defaultstore: 'pages/' } }
      }
    };
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => (config[key] !== undefined ? config[key] : def)),
      getResolvedDataPath: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        return def;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    const engine: { getManager: (name: string) => unknown } = { getManager: () => null };
    const validation = new ValidationManager(engine);
    engine.getManager = (name: string) =>
      name === 'ConfigurationManager' ? configManager : name === 'ValidationManager' ? validation : null;
    validation.loadSystemCategories(configManager);
    provider = new VersioningFileProvider(engine);
    await provider.initialize();
  });

  afterEach(async () => {
    await fs.remove(testDir); // this test's own temp dir only
  });

  test('a page in a system-category with no storageLocation is refused', async () => {
    await expect(provider.savePage('Dev Notes', 'text', { uuid: UUID, 'system-category': 'developer' }, TEST_ACTOR))
      .rejects.toThrow(/not stored on the site/);
    expect(await fs.pathExists(path.join(pagesDir, `${UUID}.md`))).toBe(false);
  });

  test("a leftover source: 'repo' beside a storageLocation is ignored: the page is saved", async () => {
    await provider.savePage('Notes', 'text', { uuid: UUID, 'system-category': 'notes' }, TEST_ACTOR);
    expect(await fs.pathExists(path.join(pagesDir, `${UUID}.md`))).toBe(true);
  });

  test('a system-category the site does not know is not refused', async () => {
    await provider.savePage('Odd', 'text', { uuid: UUID, 'system-category': 'unknown-kind' }, TEST_ACTOR);
    expect(await fs.pathExists(path.join(pagesDir, `${UUID}.md`))).toBe(true);
  });
});
