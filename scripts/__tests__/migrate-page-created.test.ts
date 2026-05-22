/**
 * Tests for #754 — Page `created` backfill migration script.
 *
 * Tests the pure `transformFrontmatter()` function (no filesystem) plus the
 * `readManifestDateCreated()` helper against a tmp directory tree. The first
 * batch nails down the source-fallback chain (manifest → mtime → lastModified)
 * and the safety invariant that we NEVER touch `lastModified` or
 * `user-keywords`. The second batch exercises the manifest-finder against the
 * three real layouts (pages, required-pages, private).
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import matter from 'gray-matter';
import { transformFrontmatter, readManifestDateCreated } from '../migrate-page-created';

function fm(raw: string) {
  return matter(raw).data as Record<string, unknown>;
}

const RAW_NO_CREATED = [
  '---',
  'title: Welcome',
  'uuid: 11111111-1111-1111-1111-111111111111',
  'lastModified: "2026-01-15T10:00:00.000Z"',
  'author: alice',
  'user-keywords:',
  '  - howto',
  '---',
  '',
  '# Welcome',
  'body content'
].join('\n');

describe('transformFrontmatter — source fallback chain (#754)', () => {
  test('manifest wins when all three sources are present', () => {
    const out = transformFrontmatter(RAW_NO_CREATED, {
      manifest: '2024-06-01T12:00:00.000Z',
      mtime: '2025-07-01T00:00:00.000Z',
      lastModified: '2026-01-15T10:00:00.000Z'
    });
    expect(out.outcome).toBe('migrated');
    expect(out.source).toBe('manifest');
    expect(out.created).toBe('2024-06-01T12:00:00.000Z');
    expect(fm(out.content).created).toBe('2024-06-01T12:00:00.000Z');
  });

  test('mtime wins when manifest is missing', () => {
    const out = transformFrontmatter(RAW_NO_CREATED, {
      mtime: '2025-07-01T00:00:00.000Z',
      lastModified: '2026-01-15T10:00:00.000Z'
    });
    expect(out.outcome).toBe('migrated');
    expect(out.source).toBe('mtime');
    expect(out.created).toBe('2025-07-01T00:00:00.000Z');
  });

  test('lastModified is the last-resort source — flagged as lossy', () => {
    const out = transformFrontmatter(RAW_NO_CREATED, {
      lastModified: '2026-01-15T10:00:00.000Z'
    });
    expect(out.outcome).toBe('migrated');
    expect(out.source).toBe('lastModified');
    expect(out.created).toBe('2026-01-15T10:00:00.000Z');
  });

  test('no sources available → outcome === "error" (file is left unchanged)', () => {
    const out = transformFrontmatter(RAW_NO_CREATED, {});
    expect(out.outcome).toBe('error');
    expect(out.content).toBe(RAW_NO_CREATED);
  });

  test('idempotent — existing `created` is preserved, content unchanged', () => {
    const raw = [
      '---',
      'title: Already done',
      'uuid: 22222222-2222-2222-2222-222222222222',
      'lastModified: "2026-01-15T10:00:00.000Z"',
      'created: "2020-01-01T00:00:00.000Z"',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw, {
      manifest: '2024-06-01T12:00:00.000Z'
    });
    expect(out.outcome).toBe('already');
    expect(out.content).toBe(raw);
  });

  test('SAFETY: migration NEVER mutates `lastModified` or `user-keywords`', () => {
    const out = transformFrontmatter(RAW_NO_CREATED, {
      manifest: '2024-06-01T12:00:00.000Z'
    });
    expect(out.outcome).toBe('migrated');

    const dataIn = fm(RAW_NO_CREATED);
    const dataOut = fm(out.content);

    expect(dataOut.lastModified).toBe(dataIn.lastModified);
    expect(dataOut['user-keywords']).toEqual(dataIn['user-keywords']);
    // And the body is preserved
    expect(out.content).toContain('# Welcome');
    expect(out.content).toContain('body content');
  });
});

describe('readManifestDateCreated — layout discovery (#754)', () => {
  let tmpRoot: string;
  let pagesDir: string;
  let requiredDir: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'migrate-page-created-'));
    pagesDir = path.join(tmpRoot, 'pages');
    requiredDir = path.join(tmpRoot, 'required-pages');
    await fs.ensureDir(pagesDir);
    await fs.ensureDir(requiredDir);
  });

  afterEach(async () => {
    // Only remove the tmp tree we created. Per the global data-safety rule:
    // never call fs.remove on a path that could resolve to a live `data/`
    // directory. `tmpRoot` is always under os.tmpdir(), so this is safe.
    if (tmpRoot && tmpRoot.startsWith(os.tmpdir())) {
      await fs.remove(tmpRoot);
    }
  });

  async function writeManifest(versionRoot: string, uuid: string, v1Date: string) {
    const dir = path.join(versionRoot, uuid);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'manifest.json'), {
      pageId: uuid,
      pageName: 'whatever',
      currentVersion: 1,
      versions: [
        { version: 1, dateCreated: v1Date, editor: 'system', changeType: 'created', comment: 'initial', contentHash: 'h', contentSize: 1, compressed: false, isDelta: false }
      ]
    });
  }

  test('finds v1.dateCreated for a page in pages/<uuid>.md', async () => {
    const uuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const pageFile = path.join(pagesDir, `${uuid}.md`);
    await fs.writeFile(pageFile, '---\ntitle: A\nuuid: ' + uuid + '\nlastModified: "2026-01-15"\n---\nbody');
    await writeManifest(path.join(pagesDir, 'versions'), uuid, '2024-06-01T12:00:00.000Z');

    const result = await readManifestDateCreated(pageFile, pagesDir, requiredDir);
    expect(result).toBe('2024-06-01T12:00:00.000Z');
  });

  test('finds v1.dateCreated for a private page at pages/private/<creator>/<uuid>.md', async () => {
    const uuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const pageFile = path.join(pagesDir, 'private', 'alice', `${uuid}.md`);
    await fs.ensureDir(path.dirname(pageFile));
    await fs.writeFile(pageFile, '---\ntitle: B\nuuid: ' + uuid + '\nlastModified: "2026-01-15"\nprivate: true\n---\nbody');
    // Private versions root is pages/versions/private/<uuid>, NOT pages/versions/private/<creator>/<uuid>.
    await writeManifest(path.join(pagesDir, 'versions', 'private'), uuid, '2024-05-01T09:00:00.000Z');

    const result = await readManifestDateCreated(pageFile, pagesDir, requiredDir);
    expect(result).toBe('2024-05-01T09:00:00.000Z');
  });

  test('finds v1.dateCreated for a required page at required-pages/<uuid>.md', async () => {
    const uuid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const pageFile = path.join(requiredDir, `${uuid}.md`);
    await fs.writeFile(pageFile, '---\ntitle: C\nuuid: ' + uuid + '\nlastModified: "2026-01-15"\nsystem-category: documentation\n---\nbody');
    await writeManifest(path.join(requiredDir, 'versions'), uuid, '2023-12-15T08:00:00.000Z');

    const result = await readManifestDateCreated(pageFile, pagesDir, requiredDir);
    expect(result).toBe('2023-12-15T08:00:00.000Z');
  });

  test('returns undefined when no manifest exists (file pre-dates versioning)', async () => {
    const uuid = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const pageFile = path.join(pagesDir, `${uuid}.md`);
    await fs.writeFile(pageFile, '---\ntitle: D\nuuid: ' + uuid + '\nlastModified: "2026-01-15"\n---\nbody');
    // No manifest written.

    const result = await readManifestDateCreated(pageFile, pagesDir, requiredDir);
    expect(result).toBeUndefined();
  });

  test('returns undefined when v1 entry has no dateCreated', async () => {
    const uuid = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const pageFile = path.join(pagesDir, `${uuid}.md`);
    await fs.writeFile(pageFile, '---\ntitle: E\nuuid: ' + uuid + '\nlastModified: "2026-01-15"\n---\nbody');
    const dir = path.join(pagesDir, 'versions', uuid);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'manifest.json'), {
      pageId: uuid, pageName: 'E', currentVersion: 1,
      versions: [{ version: 1, editor: 'system', changeType: 'created', comment: 'x', contentHash: 'h', contentSize: 1, compressed: false, isDelta: false }]
    });

    const result = await readManifestDateCreated(pageFile, pagesDir, requiredDir);
    expect(result).toBeUndefined();
  });

  test('survives malformed manifest.json (returns undefined, does not throw)', async () => {
    const uuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const pageFile = path.join(pagesDir, `${uuid}.md`);
    await fs.writeFile(pageFile, '---\ntitle: F\nuuid: ' + uuid + '\nlastModified: "2026-01-15"\n---\nbody');
    const dir = path.join(pagesDir, 'versions', uuid);
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'manifest.json'), '{ this is not valid JSON');

    const result = await readManifestDateCreated(pageFile, pagesDir, requiredDir);
    expect(result).toBeUndefined();
  });
});
