/**
 * #2304 — every value GET /api/page-metadata/:page returns (the page info
 * dialog's source) comes from its source of truth, for a normal versioned page
 * and a vault page, and none from the page file's stat times.
 *
 * Runs the real VersioningFileProvider and ValidationManager against a temp
 * directory. The files' atime, mtime and birthtime are set to a date no
 * frontmatter or version carries, so a value read from fs.stat shows up.
 */

vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../../providers/FileSystemProvider');

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import matter from 'gray-matter';
import path from 'path';
import os from 'os';
import VersioningFileProvider from '../../providers/VersioningFileProvider';
import ValidationManager from '../../managers/ValidationManager';
import WikiRoutes from '../WikiRoutes';
import { actor } from '../../test-support/actors';
import { vaultCategories } from '../../test-support/vaults';
import { DEFAULT_PRIVATE_STORE, formatPrivatePageName } from '../../utils/privateStorePath';
import { pageUrl } from '../../utils/pageUrl';

const STAT_TIME = new Date('2001-02-03T04:05:06.000Z');
const BASE_URL = 'https://wiki.example.org/';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const UUIDS = {
  normal: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  vault: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
};
// What IdentityManager.describeReference shows for a stored author or editor.
const SHOWN: Record<string, string> = {
  'urn:uuid:11111111-1111-4111-8111-111111111111': 'ada (urn:uuid:11111111-1111-4111-8111-111111111111)',
  molly: 'molly (urn:uuid:22222222-2222-4222-8222-222222222222)'
};

describe('GET /api/page-metadata/:page reports each value from its source (#2304)', () => {
  let testDir: string;
  let pagesDir: string;
  let provider: VersioningFileProvider;
  let routes: WikiRoutes;
  let statSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-info-sources-'));
    pagesDir = path.join(testDir, 'pages');
    const indexPath = path.join(testDir, 'data', 'page-index.json');
    const config: Record<string, unknown> = {
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
      'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
      'ngdpbase.page.provider.filesystem.autosave': true,
      'ngdpbase.page.provider.filesystem.pluralmatching': false,
      'ngdpbase.page.provider.versioning.indexfile': indexPath,
      'ngdpbase.page.provider.versioning.maxversions': 50,
      'ngdpbase.page.provider.versioning.retentiondays': 365,
      'ngdpbase.page.provider.versioning.compression': 'gzip',
      'ngdpbase.page.provider.versioning.deltastorage': true,
      'ngdpbase.page.provider.versioning.checkpointinterval': 10,
      'ngdpbase.page.provider.versioning.cachesize': 50,
      'ngdpbase.system-category': vaultCategories()
    };
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => (config[key] !== undefined ? config[key] : def)),
      getResolvedDataPath: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return path.join(testDir, 'required-pages');
        return def;
      }),
      getInstanceDataFolder: vi.fn(() => testDir),
      isBaseUrlExplicit: vi.fn(() => true),
      getBaseURL: vi.fn(() => BASE_URL)
    };
    const identityManager = {
      describeReference: vi.fn(async (_ctx: unknown, stored: string) => SHOWN[stored] ?? stored)
    };
    let validationManager: unknown = null;
    const providerEngine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return validationManager;
        return null;
      })
    };
    validationManager = new ValidationManager(providerEngine);
    provider = new VersioningFileProvider(providerEngine);
    await provider.initialize();

    const pageManager = {
      provider,
      readPage: vi.fn(async (name: string, ctx: unknown) => {
        const page = await provider.getPage(name, ctx);
        return page ? { ok: true, value: page } : { ok: false, refusal: 'not-found' };
      })
    };
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'PageManager') return pageManager;
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'IdentityManager') return identityManager;
        return null;
      })
    };
    routes = new WikiRoutes(engine);
    statSpy = vi.spyOn(fs, 'stat');
  });

  afterEach(async () => {
    statSpy.mockRestore();
    // Only this test's own temp directory under os.tmpdir().
    await fs.remove(testDir);
  });

  async function metadataOf(name: string, ctx: unknown): Promise<Record<string, any>> {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await routes.getPageMetadata({ params: { page: encodeURIComponent(name) }, userContext: ctx }, res);
    expect(res.status).not.toHaveBeenCalled();
    return res.json.mock.calls[0][0] as Record<string, any>;
  }

  /** Both the page file and its versions get stat times no source carries. */
  async function stampStatTimes(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await stampStatTimes(full);
      else await fs.utimes(full, STAT_TIME, STAT_TIME);
    }
  }

  const CASES = [
    {
      label: 'a normal versioned page',
      name: 'Health Notes',
      uuid: UUIDS.normal,
      ctx: actor('ada'),
      author: 'urn:uuid:11111111-1111-4111-8111-111111111111',
      editor: 'ada',
      category: 'general',
      route: '/view/Health%20Notes'
    },
    {
      label: 'a vault page',
      name: formatPrivatePageName('molly', DEFAULT_PRIVATE_STORE, 'JSW Health History'),
      uuid: UUIDS.vault,
      ctx: { ...actor('molly'), privateStoreHandle: 'sid' },
      author: 'molly',
      editor: 'molly',
      category: 'general',
      route: '/vaults/molly/default/JSW%20Health%20History'
    }
  ];

  describe.each(CASES)('$label', (c) => {
    const CREATED = '2026-06-17T10:20:59.212Z';

    async function build(): Promise<void> {
      // PageManager stamps a public page's slug; a vault page's is the provider's.
      const slug = c.name.startsWith('vaults/') ? {} : { slug: 'health-notes' };
      const fm = { ...slug, title: c.name.split('/').pop(), uuid: c.uuid, author: c.author, 'system-category': c.category, 'user-keywords': ['health'], created: CREATED };
      await provider.savePage(c.name, 'first body', fm, c.ctx as never);
      await sleep(15);
      await provider.savePage(c.name, 'second body with more words', fm, c.ctx as never);
      await stampStatTimes(testDir);
      statSpy.mockClear();
    }

    test('every field matches its source, none from file stats', async () => {
      await build();
      const page = (await provider.getPage(c.name, c.ctx as never))!;
      const onDisk = matter(await fs.readFile(page.filePath, 'utf8'));
      const versions = await provider.getVersionHistory(c.name, c.ctx as never);
      expect(versions.length).toBe(2);

      const meta = await metadataOf(c.name, c.ctx);

      // Title, slug, UUID: the page's frontmatter.
      expect(meta.title).toBe(onDisk.data.title);
      expect(meta.slug).toBe(onDisk.data.slug);
      expect(meta.slug).toBeTruthy();
      expect(meta.uuid).toBe(c.uuid);
      expect(meta.uuid).toBe(onDisk.data.uuid);
      // Version "vN of M": the version history.
      expect(meta.version).toBe(`v${versions[0].version} of ${versions.length}`);
      expect(meta.version).toBe('v2 of 2');
      // URL: base-url plus the page's route, no fragment or query.
      expect(meta.url).toBe(BASE_URL.replace(/\/$/, '') + c.route);
      expect(meta.url).toBe(BASE_URL.replace(/\/$/, '') + pageUrl(c.name));
      expect(meta.url).not.toMatch(/[#?]/);
      // Created and Last Modified: the frontmatter.
      expect(meta.created).toBe(CREATED);
      expect(new Date(onDisk.data.lastModified).toISOString()).toBe(meta.lastModified);
      // Author: the frontmatter author; Editor: the newest version's author; both shown as display names.
      expect(meta.author).toBe(SHOWN[onDisk.data.author] ?? onDisk.data.author);
      expect(meta.editor).toBe(SHOWN[versions[0].author] ?? versions[0].author);
      expect(meta.versionInfo.lastAuthor).toBe(meta.editor);
      // Category: the page's system-category.
      expect(meta.category).toBe(onDisk.data['system-category']);
      expect(meta.keywords).toEqual(['health']);
      // Size: the body's bytes.
      expect(meta.stats.fileSize).toBe(Buffer.byteLength(page.content, 'utf8'));
    });

    test('no Last Accessed, and nothing equals a file stat time', async () => {
      await build();
      const meta = await metadataOf(c.name, c.ctx);

      expect(meta).not.toHaveProperty('lastAccessed');
      expect(JSON.stringify(meta)).not.toContain(STAT_TIME.toISOString());
      expect(JSON.stringify(meta)).not.toMatch(/2001-02-03/);
      expect(statSpy).not.toHaveBeenCalled();
    });
  });
});
