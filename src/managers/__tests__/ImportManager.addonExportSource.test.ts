/**
 * An add-on's list as an export source (#2174): the add-on declares the
 * source in its manifest (`exportSources`), registers it through `host`, and
 * the Export action offers CSV for it, through the same run, queue and
 * download path core's own sources use. The add-on's own read permission is
 * the only gate: core adds none.
 */
import fs from 'fs-extra';
import path from 'path';
import ImportManager, { IceExportRefused } from '../ImportManager';
import BackgroundJobManager from '../BackgroundJobManager';
import ExportManager from '../ExportManager';
import { IceExportFailed } from '../../ice/runExport';
import { buildAddonHost } from '../../utils/addonHost';
import type { ActorContext } from '../../context/ActorContext';
import type { AddonManifest } from '../AddonsManager';
import fixtureAddon, { FixtureRows } from './__fixtures__/ice-export-fixture-addon/index';

const FIXTURE_DIR = path.join(__dirname, '__fixtures__/ice-export-fixture-addon');
const ALICE = { username: 'alice', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;
const BOB = { username: 'bob', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;
const ANON = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false } as unknown as ActorContext;

async function load(config: Record<string, unknown> = {}) {
  const manifest = (await fs.readJson(path.join(FIXTURE_DIR, 'package.json'))).ngdpbase as AddonManifest;
  const managers: Record<string, unknown> = {};
  const engine = {
    getManager: (name: string) => managers[name] ?? null,
    registerManager: (name: string, m: unknown) => { managers[name] = m; }
  };
  managers['ConfigurationManager'] = { getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback) };
  managers['ExportManager'] = new ExportManager(engine);
  managers['BackgroundJobManager'] = new BackgroundJobManager(engine);
  const im = new ImportManager(engine);
  managers['ImportManager'] = im;
  await im.initialize();

  const host = buildAddonHost(manifest.slug, {}, undefined, engine, manifest);
  await fixtureAddon.register(engine, {}, host);
  const rows = managers['FixtureRows'] as FixtureRows;
  rows.readers.add('alice');
  rows.rows.push(
    { id: 'r1', owner: 'alice', properties: { date: '2026-01-02', memo: 'Coffee, large', amount: -450 } },
    { id: 'r2', owner: 'carol', properties: { date: '2026-01-03', memo: 'Carol only', amount: 10 } },
    { id: 'r3', owner: 'carol', shared: true, properties: { date: '2026-01-04', memo: '=SUM(A1:A9)', note: 'shared "quoted"' } }
  );
  return { im, rows, manifest, host, engine };
}

async function finished(im: ImportManager, runId: string, ctx: ActorContext) {
  await vi.waitFor(() => expect(['done', 'failed']).toContain(im.getExportRun(runId, ctx)?.state));
  return im.getExportRun(runId, ctx)!;
}

describe('registering an add-on export source', () => {
  test('a source the manifest declares is registered under the add-on\'s slug', async () => {
    const { im, manifest } = await load();
    expect(manifest).toMatchObject({ slug: 'ice-export', exportSources: ['rows'] });
    expect((await im.exportFormatsFor('ice-export.rows', 'all', ALICE)).length).toBeGreaterThan(0);
  });

  test('a source the manifest does not declare is refused, and nothing is registered', async () => {
    const { im, host } = await load();
    const source = { name: 'other', yields: 'record', mayExport: async () => true, read: async () => [] };
    expect(() => host.registerExportSource(source)).toThrow(/may register only the exportSources its manifest declares.*'other' is not one of them \(declared: rows\)/);
    expect(await im.exportFormatsFor('ice-export.other', 'all', ALICE)).toEqual([]);
  });

  test('an add-on that declares none cannot register one', async () => {
    const { engine } = await load();
    const host = buildAddonHost('bare', {}, undefined, engine, { shims: [], receivers: [] });
    expect(() => host.registerExportSource({ name: 'rows', yields: 'record', mayExport: async () => true, read: async () => [] })).toThrow(/declared: none/);
  });
});

describe('exporting an add-on\'s list as CSV', () => {
  test('a user who may read is offered CSV and nothing that cannot be made from records', async () => {
    const { im } = await load();
    expect(await im.exportFormatsFor('ice-export.rows', 'all', ALICE)).toEqual([
      { id: 'core.csv-file', label: 'CSV (.csv)', chain: ['core.csv-file'] }
    ]);
  });

  test('the CSV holds only the rows that user may read, with a header from every key, quoted, formulas guarded', async () => {
    const { im, rows } = await load();
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run).toMatchObject({ state: 'done', file: { name: 'rows.csv', mediaType: expect.stringContaining('text/csv') } });
    const text = im.exportFile(runId, ALICE)!.bytes.toString('utf8');
    expect(text).toBe([
      'date,memo,amount,note',
      '2026-01-02,"Coffee, large",-450,',
      '2026-01-04,\'=SUM(A1:A9),,"shared ""quoted"""',
      ''
    ].join('\r\n'));
    expect(text).not.toContain('Carol only');
    expect(rows.reads).toEqual(['alice']);
    // Someone else neither sees the run nor downloads the file.
    expect(im.getExportRun(runId, BOB)).toBeNull();
    expect(im.exportFile(runId, BOB)).toBeNull();
  });

  test('a user who may not read is offered nothing, and a direct request is refused before any row is read', async () => {
    const { im, rows } = await load();
    expect(await im.exportFormatsFor('ice-export.rows', 'all', BOB)).toEqual([]);
    await expect(im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, BOB)).rejects.toBeInstanceOf(IceExportRefused);
    expect(rows.reads).toEqual([]);
  });

  test('a visitor who is not signed in is offered nothing', async () => {
    const { im, rows } = await load();
    rows.readers.add('Anonymous');
    expect(await im.exportFormatsFor('ice-export.rows', 'all', ANON)).toEqual([]);
    await expect(im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ANON)).rejects.toBeInstanceOf(IceExportRefused);
  });

  test('a format that cannot be made from records is refused', async () => {
    const { im } = await load();
    await expect(im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.pdf' }, ALICE)).rejects.toBeInstanceOf(IceExportRefused);
  });

  test('max-items ends the list and the export says how many rows were left out', async () => {
    const { im } = await load({ 'ngdpbase.export.engine.max-items': 1 });
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run.state).toBe('done');
    expect(run.notes).toEqual(['1 item was left out: this site exports at most 1 item at a time.']);
    expect(im.exportFile(runId, ALICE)!.bytes.toString('utf8')).toBe('date,memo,amount\r\n2026-01-02,"Coffee, large",-450\r\n');
  });

  test('max-bytes refuses an export larger than the site allows', async () => {
    const { im } = await load({ 'ngdpbase.export.engine.max-bytes': 10 });
    await expect(im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE)).rejects.toBeInstanceOf(IceExportFailed);
  });

  test('a site can switch the CSV format off', async () => {
    const { im } = await load({ 'ngdpbase.import.shims.core.csv-file.enabled': false });
    expect(await im.exportFormatsFor('ice-export.rows', 'all', ALICE)).toEqual([]);
  });
});
