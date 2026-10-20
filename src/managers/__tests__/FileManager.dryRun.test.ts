/**
 * The files migration dry run (#1859) through the read-only door (#1852).
 *
 * `FileManager.openForOperator()` opens the site's real configuration and
 * attachment index from a fixture data folder, as `npm run
 * files:migration:dry` does, and the dry run reports what the copy WOULD do:
 * clash suffixes, owners from the configured mapping, pages to rewrite, and
 * each vault as counts. Then the point of the whole command: the data folder
 * is byte-for-byte what it was, with no file added, changed or touched.
 */

vi.unmock('../../providers/BasicAttachmentProvider');

import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import FileManager from '../FileManager';
import { jobContextFromOperator } from '../../context/JobContext';
import { formatFileMigrationReport } from '../../utils/fileMigrationPlan';
import { storeFileIndexPath, storeMetaPath, privateStoreAttachmentsDir } from '../../utils/privateStorePath';

const OPERATOR = jobContextFromOperator('jim', 'dry run test');

/** Every file and folder under `root`: its bytes' hash and modification time. */
async function snapshot(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    for (const d of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name);
      const rel = path.relative(root, full);
      const stat = await fs.stat(full);
      if (d.isDirectory()) {
        out[`${rel}/`] = String(stat.mtimeMs);
        await walk(full);
      } else {
        out[rel] = `${crypto.createHash('sha256').update(await fs.readFile(full)).digest('hex')} ${stat.mtimeMs}`;
      }
    }
  }
  await walk(root);
  return out;
}

describe('files migration dry run (#1859)', () => {
  let tmp: string;
  let fast: string;
  let slow: string;
  const saved = { FAST_STORAGE: process.env.FAST_STORAGE, SLOW_STORAGE: process.env.SLOW_STORAGE, INSTANCE_DATA_FOLDER: process.env.INSTANCE_DATA_FOLDER };

  function poolRecord(id: string, name: string, author: string | null, dateCreated: string, page: string | null) {
    return {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      identifier: id,
      name,
      description: '',
      ...(author ? { author: { '@type': 'Person', name: author } } : {}),
      dateCreated,
      dateModified: dateCreated,
      encodingFormat: 'image/png',
      contentSize: 100,
      url: `/attachments/${id}`,
      // A path from another machine: a start that may write would "correct" it
      // in place (migrateStaleStoragePaths). The read-only open must not.
      storageLocation: `/old/machine/attachments/${id}.png`,
      mentions: page ? [{ '@type': 'WebPage', name: page, url: `/view/${encodeURIComponent(page)}` }] : []
    };
  }

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'files-dry-run-'));
    fast = path.join(tmp, 'fast');
    slow = path.join(tmp, 'slow');
    process.env.FAST_STORAGE = fast;
    process.env.SLOW_STORAGE = slow;
    delete process.env.INSTANCE_DATA_FOLDER;

    await fs.outputJson(path.join(fast, 'config', 'app-custom-config.json'), {
      'ngdpbase.files.migration.owner-map': { 'jim@willeke.com': 'jim' },
      'ngdpbase.files.migration.default-owner': 'jim'
    });

    // The public pool: three different files named route.png, one per page,
    // and a file already called route-001.png, so the numbering skips it.
    const attachments = path.join(slow, 'attachments');
    const records = [
      poolRecord('r1', 'route.png', 'jim', '2026-01-01T00:00:00.000Z', 'Walk One'),
      poolRecord('r2', 'route.png', 'Unknown', '2026-01-02T00:00:00.000Z', 'Walk Two'),
      poolRecord('r3', 'route.png', 'jim@willeke.com', '2026-01-03T00:00:00.000Z', 'Walk Three'),
      poolRecord('x1', 'route-001.png', null, '2026-01-04T00:00:00.000Z', 'Map')
    ];
    for (const r of records) await fs.outputFile(path.join(attachments, `${r.identifier}.png`), `png ${r.identifier}`);
    await fs.outputJson(path.join(attachments, 'attachment-metadata.json'), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'attachments', description: 'fixture', attachments: records
    });

    // An unsealed vault with a clash of its own, and a sealed one.
    const pages = path.join(slow, 'pages');
    await fs.outputJson(storeMetaPath(pages, 'molly', 'default'), { kind: 'default', encrypt: false });
    const entry = (id: string, dateCreated: string) => ({
      id, fileName: `${id}.pdf`, name: 'scan.pdf', encodingFormat: 'application/pdf', contentSize: 50,
      fingerprint: id, description: '', author: 'molly', dateCreated, dateModified: dateCreated, mentions: []
    });
    await fs.outputJson(storeFileIndexPath(pages, 'molly', 'default'), {
      version: 1, files: { v1: entry('v1', '2026-03-01T00:00:00.000Z'), v2: entry('v2', '2026-03-02T00:00:00.000Z') }
    });
    for (const id of ['v1', 'v2']) await fs.outputFile(path.join(privateStoreAttachmentsDir(pages, 'molly', 'default'), `${id}.pdf`), 'pdf');
    await fs.outputJson(storeMetaPath(pages, 'molly', 'capture'), { kind: 'capture', encrypt: true, dekWrap: { iv: 'a', tag: 'b', ct: 'c' } });
    await fs.outputFile(path.join(privateStoreAttachmentsDir(pages, 'molly', 'capture'), 'sealed-1.jpg'), Buffer.alloc(300));
    await fs.outputFile(storeFileIndexPath(pages, 'molly', 'capture'), 'ciphertext');
  });

  afterEach(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await fs.remove(tmp);
  });

  test('reports clashes with their -### names, owners from the mapping, pages to rewrite, vaults as counts', async () => {
    const files = await FileManager.openForOperator();
    const report = await files.migrationDryRun(OPERATOR);

    expect(report.publicFiles).toEqual({ count: 4, bytes: 400, byType: [{ type: 'image/png', files: 4 }] });

    // The oldest keeps the name; route-001.png is taken, so the others are -002 and -003.
    expect(report.clashes).toEqual([{
      name: 'route.png',
      files: 3,
      renames: [
        { id: 'r2', from: 'route.png', to: 'route-002.png', pages: ['Walk Two'] },
        { id: 'r3', from: 'route.png', to: 'route-003.png', pages: ['Walk Three'] }
      ]
    }]);
    expect(report.pagesToRewrite).toEqual([
      { page: 'Walk Three', changes: [{ from: 'route.png', to: 'route-003.png' }] },
      { page: 'Walk Two', changes: [{ from: 'route.png', to: 'route-002.png' }] }
    ]);

    expect(report.noOwner).toBe(3);
    expect(report.owners).toEqual(expect.arrayContaining([
      { recorded: 'jim', owner: 'jim', how: 'kept', files: 1 },
      { recorded: 'jim@willeke.com', owner: 'jim', how: 'mapped', files: 1 },
      { recorded: 'Unknown', owner: 'jim', how: 'default', files: 1 },
      { recorded: null, owner: 'jim', how: 'default', files: 1 }
    ]));
    expect(report.owners).toHaveLength(4);

    // Vaults: counts only. The sealed one is counted on disk, its clashes unknown.
    expect(report.vaults).toEqual(expect.arrayContaining([
      { owner: 'molly', vault: 'default', systemCategory: 'general', readable: true, files: 2, bytes: 100, clashes: 1 },
      { owner: 'molly', vault: 'capture', systemCategory: 'capture', readable: false, files: 1, bytes: 300, clashes: null }
    ]));
    expect(report.vaults).toHaveLength(2);
    // A vault's names never leave the door.
    expect(JSON.stringify(report.vaults)).not.toContain('scan.pdf');

    const text = formatFileMigrationReport(report);
    expect(text).toContain('DRY RUN');
    expect(text).toContain('r2 -> route-002.png (on Walk Two)');
    expect(text).toContain('Unknown -> jim [default-owner]: 1');
    expect(text).not.toContain('scan.pdf');
  });

  test('writes nothing: the data folders are byte-identical, with nothing added or touched', async () => {
    const before = await snapshot(tmp);

    const files = await FileManager.openForOperator();
    await files.migrationDryRun(OPERATOR);
    await files.migrationDryRun(OPERATOR);

    expect(await snapshot(tmp)).toEqual(before);
  });

  test('the inventory refuses a context that is not the operator\'s', async () => {
    const files = await FileManager.openForOperator();
    const request = { username: 'jim', isAuthenticated: true, roles: ['admin'] };
    await expect(files.migrationDryRun(request as never)).rejects.toThrow(/operator command only/);
  });
});
