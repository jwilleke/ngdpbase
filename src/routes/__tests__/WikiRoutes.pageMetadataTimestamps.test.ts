/**
 * #2290 — GET /api/page-metadata/:page must report a page's true creation time
 * and a `lastModified` that the ingest conflict check accepts.
 *
 * Runs the real VersioningFileProvider against a temp directory, because the
 * defect lived in what the provider writes to disk (a new file on every save,
 * and a version timestamp stamped after the page file's own `lastModified`),
 * which a mocked provider cannot reproduce.
 */

vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../../providers/FileSystemProvider');

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import matter from 'gray-matter';
import path from 'path';
import os from 'os';
import VersioningFileProvider from '../../providers/VersioningFileProvider';
import WikiRoutes from '../WikiRoutes';
import { TEST_ACTOR } from '../../test-support/actors';
import { isStaleSave, versionTokenOf } from '../../utils/pageVersionToken';

const ORIGINAL_CREATED = '2026-06-17T10:20:59.212Z';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('GET /api/page-metadata/:page timestamps (#2290)', () => {
  let testDir: string;
  let provider: VersioningFileProvider;
  let routes: WikiRoutes;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `page-metadata-ts-${process.pid}-${Date.now()}`);
    await fs.ensureDir(testDir);
    const indexPath = path.join(testDir, 'data', 'page-index.json');
    const config: Record<string, unknown> = {
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider.filesystem.storagedir': path.join(testDir, 'pages'),
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
      'ngdpbase.page.provider.versioning.cachesize': 50
    };
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => (config[key] !== undefined ? config[key] : def)),
      getResolvedDataPath: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(testDir, 'pages');
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return path.join(testDir, 'required-pages');
        return def;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    const providerEngine = {
      getManager: vi.fn((name: string) => (name === 'ConfigurationManager' ? configManager : null))
    };
    provider = new VersioningFileProvider(providerEngine);
    await provider.initialize();

    const pageManager = {
      provider,
      readPage: vi.fn(async (name: string) => {
        const page = await provider.getPage(name);
        return page ? { ok: true, value: page } : { ok: false, refusal: 'not-found' };
      })
    };
    const engine = {
      getManager: vi.fn((name: string) => (name === 'PageManager' ? pageManager : null))
    };
    routes = new WikiRoutes(engine);
  });

  afterEach(async () => {
    // Only this test's own temp directory under os.tmpdir().
    if (await fs.pathExists(testDir)) await fs.remove(testDir);
  });

  async function metadataOf(name: string): Promise<Record<string, unknown>> {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await routes.getPageMetadata({ params: { page: encodeURIComponent(name) }, userContext: TEST_ACTOR }, res);
    expect(res.status).not.toHaveBeenCalled();
    return res.json.mock.calls[0][0] as Record<string, unknown>;
  }

  async function sourceOf(name: string): Promise<string> {
    const page = await provider.getPage(name);
    return fs.readFile(page!.filePath, 'utf8');
  }

  const CUSTOM = { author: 'jim', 'system-category': 'general', 'user-keywords': ['a', 'b'], title: 'Skill', created: ORIGINAL_CREATED };

  test('a body-only update keeps created at the original creation time', async () => {
    await provider.savePage('Skill', 'first body', CUSTOM, TEST_ACTOR);
    const before = await metadataOf('Skill');
    await sleep(25);
    // What ingest does: same frontmatter minus any creation metadata, new body.
    const { created: _omit, ...withoutCreated } = CUSTOM;
    void _omit;
    await provider.savePage('Skill', 'second body', withoutCreated, TEST_ACTOR);
    const after = await metadataOf('Skill');

    expect(after.created).toBe(ORIGINAL_CREATED);
    expect(after.created).toBe(before.created);
    expect(new Date(after.lastModified as string).getTime())
      .toBeGreaterThan(new Date(before.lastModified as string).getTime());
    expect(after.version).toBe('v2 of 2');
  });

  test('created survives repeated updates', async () => {
    const { created: _omit, ...withoutCreated } = CUSTOM;
    void _omit;
    await provider.savePage('Skill', 'one', CUSTOM, TEST_ACTOR);
    for (const body of ['two', 'three', 'four']) {
      await sleep(10);
      await provider.savePage('Skill', body, withoutCreated, TEST_ACTOR);
      expect((await metadataOf('Skill')).created).toBe(ORIGINAL_CREATED);
    }
  });

  test('a page with no created field reports the first version time, not the latest update', async () => {
    const { created: _omit, ...withoutCreated } = CUSTOM;
    void _omit;
    const legacy = { ...withoutCreated, title: 'Legacy' };
    await provider.savePage('Legacy', 'one', legacy, TEST_ACTOR);
    const page = await provider.getPage('Legacy');
    // A page written before `created` existed: strip it from the file on disk.
    const parsed = matter(await fs.readFile(page!.filePath, 'utf8'));
    delete parsed.data.created;
    await fs.writeFile(page!.filePath, matter.stringify(parsed.content, parsed.data));
    const first = await metadataOf('Legacy');
    await sleep(25);
    await provider.savePage('Legacy', 'two', legacy, TEST_ACTOR);
    const second = await metadataOf('Legacy');

    expect(second.created).toBe(first.created);
    expect(new Date(second.created as string).getTime())
      .toBeLessThan(new Date(second.lastModified as string).getTime());
  });

  test('metadata lastModified is accepted as ingest baseLastModified on an unchanged page', async () => {
    await provider.savePage('Skill', 'one', CUSTOM, TEST_ACTOR);
    await sleep(15);
    await provider.savePage('Skill', 'two', CUSTOM, TEST_ACTOR);
    const meta = await metadataOf('Skill');
    const current = versionTokenOf((await provider.getPage('Skill'))!.metadata);

    expect(versionTokenOf({ lastModified: meta.lastModified })).toBe(current);
    expect(isStaleSave(meta.lastModified as string, current)).toBe(false);
  });

  test('a real intervening edit makes the earlier metadata lastModified stale', async () => {
    await provider.savePage('Skill', 'one', CUSTOM, TEST_ACTOR);
    const read = await metadataOf('Skill');
    await sleep(15);
    await provider.savePage('Skill', 'someone else edited', CUSTOM, TEST_ACTOR);
    const current = versionTokenOf((await provider.getPage('Skill'))!.metadata);

    expect(isStaleSave(read.lastModified as string, current)).toBe(true);
  });

  test('an update leaves uuid, slug, author, taxonomy and custom metadata alone', async () => {
    const custom = { ...CUSTOM, slug: 'grok-ncm-converter-skill', 'ncm-note': 'keep me' };
    await provider.savePage('Skill', 'one', custom, TEST_ACTOR);
    const was = matter(await sourceOf('Skill')).data;
    await sleep(15);
    const { created: _omit, ...withoutCreated } = custom;
    void _omit;
    await provider.savePage('Skill', 'two', withoutCreated, TEST_ACTOR);
    const now = matter(await sourceOf('Skill'));

    for (const key of ['uuid', 'slug', 'author', 'system-category', 'user-keywords', 'ncm-note', 'created']) {
      expect(now.data[key]).toEqual(was[key]);
    }
    expect(now.content.trim()).toBe('two');
  });
});
