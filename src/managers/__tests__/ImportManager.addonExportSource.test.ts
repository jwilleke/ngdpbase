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

  test('a user who may not read is offered nothing, and a direct request is refused without a row being read', async () => {
    const { im, rows } = await load();
    expect(await im.exportFormatsFor('ice-export.rows', 'all', BOB)).toEqual([]);
    await expect(im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, BOB)).rejects.toBeInstanceOf(IceExportRefused);
    expect(rows.reads).toEqual([]);
  });

  test('core asks the source\'s mayExport before it reads: a source that says no is refused even though its read would return rows', async () => {
    const { im, rows } = await load();
    rows.exportRefused.add('alice');
    expect(await im.exportFormatsFor('ice-export.rows', 'all', ALICE)).toEqual([]);
    await expect(im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE)).rejects.toBeInstanceOf(IceExportRefused);
    expect(rows.reads).toEqual([]);
  });

  test('a record with 1,500 different keys per row is refused before the table is built, with a plain message', async () => {
    const { im, rows } = await load();
    const wide = (n: number) => Object.fromEntries(Array.from({ length: 1500 }, (_, k) => [`field-${n}-${k}`, 'x']));
    rows.rows.length = 0;
    for (let n = 0; n < 200; n++) rows.rows.push({ id: `w${n}`, owner: 'alice', properties: wide(n) });
    const toCsv = vi.spyOn(ExportManager.prototype, 'toCsv');
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run.state).toBe('failed');
    expect(run.error).toMatch(/too many columns/i);
    expect(run.error).not.toMatch(/#\d|github/i);
    expect(toCsv).not.toHaveBeenCalled();
    toCsv.mockRestore();
  });

  test('a normal 200-row export still downloads', async () => {
    const { im, rows } = await load();
    rows.rows.length = 0;
    for (let n = 0; n < 200; n++) rows.rows.push({ id: `n${n}`, owner: 'alice', properties: { date: '2026-01-02', memo: `row ${n}`, amount: n } });
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run.state).toBe('done');
    expect(im.exportFile(runId, ALICE)!.bytes.toString('utf8').split('\r\n')).toHaveLength(202);
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

  // #2408: max-items and max-bytes are for pages, files and search; a records CSV has neither limit.
  test('1,000 records are all downloaded as CSV, with no "left out" note, under the default max-items', async () => {
    const { im, rows } = await load();
    rows.rows.length = 0;
    for (let n = 0; n < 1000; n++) rows.rows.push({ id: `b${n}`, owner: 'alice', properties: { memo: `row ${n}`, amount: n } });
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run.state).toBe('done');
    expect(run.notes).toBeUndefined();
    expect(im.exportFile(runId, ALICE)!.bytes.toString('utf8').split('\r\n')).toHaveLength(1002);
  });

  test('max-items does not cut a records CSV, even set to 1', async () => {
    const { im } = await load({ 'ngdpbase.export.engine.max-items': 1 });
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run.state).toBe('done');
    expect(run.notes).toBeUndefined();
    expect(im.exportFile(runId, ALICE)!.bytes.toString('utf8').split('\r\n')).toHaveLength(4);
  });

  test('a records CSV larger than max-bytes downloads in full', async () => {
    const { im } = await load({ 'ngdpbase.export.engine.max-bytes': 10 });
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run.state).toBe('done');
    expect(im.exportFile(runId, ALICE)!.bytes.toString('utf8')).toContain('Coffee, large');
  });

  test('csv-max-columns still refuses a records CSV, whatever max-items and max-bytes say', async () => {
    const { im, rows } = await load({ 'ngdpbase.export.engine.max-bytes': 10, 'ngdpbase.export.engine.max-items': 1 });
    rows.rows.length = 0;
    rows.rows.push({ id: 'w', owner: 'alice', properties: Object.fromEntries(Array.from({ length: 1500 }, (_, k) => [`f${k}`, 'x'])) });
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run.state).toBe('failed');
    expect(run.error).toMatch(/too many columns/i);
  });

  // #2410: no row limit, but the table a CSV builds (rows x columns) is capped before it is built.
  const sparse = (rows: ReturnType<typeof load> extends Promise<infer T> ? T['rows'] : never, n: number) => {
    rows.rows.length = 0;
    // n rows, each with one column of its own: n rows x n columns of cells, but only n small properties in.
    for (let i = 0; i < n; i++) rows.rows.push({ id: `s${i}`, owner: 'alice', properties: { [`field${i}`]: 1 } });
  };

  test('csv-max-cells refuses a records CSV before the table is built, whatever max-bytes says (#2410)', async () => {
    const { im, rows, engine } = await load({ 'ngdpbase.export.engine.csv-max-cells': 400 });
    sparse(rows, 30); // 900 cells
    const toCsv = vi.spyOn((engine.getManager('ExportManager') as ExportManager), 'toCsv');
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run.state).toBe('failed');
    expect(run.error).toMatch(/too big for a CSV file.*fewer records or fewer fields/i);
    expect(run.error).not.toMatch(/#\d|docs\//);
    expect(toCsv).not.toHaveBeenCalled();
    expect(im.exportFile(runId, ALICE)).toBeNull();
  });

  test('the shipped default for csv-max-cells is 20 million cells (#2409)', async () => {
    const shipped = await fs.readJson(path.join(__dirname, '../../../config/app-default-config.json'));
    expect(shipped['ngdpbase.export.engine.csv-max-cells']).toBe(20_000_000);
  });

  test('with csv-max-cells unset, the fallback the code reads is 20 million cells (#2409)', async () => {
    const { im, engine } = await load();
    const getProperty = vi.spyOn(engine.getManager('ConfigurationManager') as { getProperty: (k: string, d: unknown) => unknown }, 'getProperty');
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    expect((await finished(im, runId, ALICE)).state).toBe('done');
    expect(getProperty).toHaveBeenCalledWith('ngdpbase.export.engine.csv-max-cells', 20_000_000);
  });

  test('a records CSV with exactly csv-max-cells cells is made', async () => {
    const { im, rows } = await load({ 'ngdpbase.export.engine.csv-max-cells': 900 });
    sparse(rows, 30);
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    expect((await finished(im, runId, ALICE)).state).toBe('done');
  });

  test('a finished file over max-held-bytes is refused and not kept, though its input was small (#2410)', async () => {
    // 100 rows with a column each: about 3 KB in, about 10 KB of CSV out.
    const { im, rows } = await load({ 'ngdpbase.export.engine.max-held-bytes': 6000 });
    sparse(rows, 100);
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    const run = await finished(im, runId, ALICE);
    expect(run.state).toBe('failed');
    expect(run.error).toMatch(/too big for this site to hold.*fewer records or fewer fields/i);
    expect(run.file).toBeUndefined();
    expect(im.exportFile(runId, ALICE)).toBeNull();
  });

  test('a finished file that fits max-held-bytes is still kept', async () => {
    const { im, rows } = await load({ 'ngdpbase.export.engine.max-held-bytes': 60000 });
    sparse(rows, 100);
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    expect((await finished(im, runId, ALICE)).state).toBe('done');
    expect(im.exportFile(runId, ALICE)).not.toBeNull();
  });

  test('recordExport gets the count and at most the first 200 names, not every name (#2411)', async () => {
    const { im, rows } = await load();
    rows.rows.length = 0;
    for (let n = 0; n < 350; n++) rows.rows.push({ id: `n${n}`, owner: 'alice', properties: { memo: `row ${n}` } });
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    await finished(im, runId, ALICE);
    await vi.waitFor(() => expect(rows.outcomes).toHaveLength(1));
    expect(rows.outcomes[0]).toMatchObject({ count: 350, result: 'success' });
    expect(rows.outcomes[0].items).toHaveLength(200);
  });

  test('recordExport names every item when there are 200 or fewer', async () => {
    const { im, rows } = await load();
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    await finished(im, runId, ALICE);
    await vi.waitFor(() => expect(rows.outcomes).toHaveLength(1));
    expect(rows.outcomes[0]).toMatchObject({ count: 2, items: ['rows', 'rows'] });
  });

  test('the size of the items is worked out once per run, not once per step (#2412)', async () => {
    const { im, rows } = await load();
    const data = { id: 'only', properties: { memo: 'x' } };
    rows.rows.length = 0;
    rows.rows.push({ id: 'only', owner: 'alice', properties: data.properties });
    const stringify = vi.spyOn(JSON, 'stringify');
    const runId = await im.startExport({ source: 'ice-export.rows', ref: 'all', format: 'core.csv-file' }, ALICE);
    await finished(im, runId, ALICE);
    const ofRecord = stringify.mock.calls.filter(([value]) => (value as { id?: string } | undefined)?.id === 'only');
    stringify.mockRestore();
    expect(ofRecord).toHaveLength(1);
  });

  test('a site can switch the CSV format off', async () => {
    const { im } = await load({ 'ngdpbase.import.shims.core.csv-file.enabled': false });
    expect(await im.exportFormatsFor('ice-export.rows', 'all', ALICE)).toEqual([]);
  });
});
