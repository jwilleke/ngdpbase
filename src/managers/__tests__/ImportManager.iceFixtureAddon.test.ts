/**
 * The ICE fixture add-on end to end (#1979, first slice part 2): an add-on
 * shaped like yourPHR registers its C-CDA and FHIR shims and its manager's
 * receiver through `host`, declared in its manifest, and an import runs
 * through the engine into that manager's door with the person's context.
 */
import fs from 'fs-extra';
import path from 'path';
import ImportManager from '../ImportManager';
import { buildAddonHost } from '../../utils/addonHost';
import { buildAddonHost as kitBuildAddonHost } from '../../../packages/ngdpbase-types/testing';
import { MemoryIceLedger } from '../../ice/ledger';
import { packZip } from '../../utils/zipArchive';
import { jobContextFromRequest } from '../../context/JobContext';
import type { ActorContext } from '../../context/ActorContext';
import type { AddonManifest } from '../AddonsManager';
import fixtureAddon, { FixtureHealthRecords } from './__fixtures__/ice-fixture-addon/index';

const FIXTURE_DIR = path.join(__dirname, '__fixtures__/ice-fixture-addon');
const ALICE = { username: 'alice', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;
const BOB = { username: 'bob', roles: ['reader'], isAuthenticated: true } as unknown as ActorContext;

const CCDA = (observations: string, extra = ''): string =>
  `<?xml version="1.0"?>\n<ClinicalDocument xmlns="urn:hl7-org:v3">\n${observations}\n${extra}</ClinicalDocument>`;

async function loadFixture() {
  const manifest = (await fs.readJson(path.join(FIXTURE_DIR, 'package.json'))).ngdpbase as AddonManifest;
  const managers = new Map<string, unknown>();
  const engine = {
    getManager: (name: string) => managers.get(name) ?? null,
    registerManager: (name: string, m: unknown) => { managers.set(name, m); }
  };
  managers.set('ConfigurationManager', { getProperty: (_k: string, fallback: unknown) => fallback });
  const im = new ImportManager(engine);
  managers.set('ImportManager', im);
  await im.initialize();
  im.setImportLedger(new MemoryIceLedger());

  const host = buildAddonHost(manifest.slug, {}, undefined, engine, manifest);
  await fixtureAddon.register(engine, {}, host);
  const records = managers.get('FixtureHealthRecords') as FixtureHealthRecords;
  return { im, records, manifest, engine };
}

describe('ICE fixture add-on (phr-shaped)', () => {
  test('its manifest declares the shims and the receiver; the host registers them under its slug', async () => {
    const { im, manifest } = await loadFixture();
    expect(manifest).toMatchObject({ slug: 'ice-fixture', shims: ['ccda', 'fhir'], receivers: ['health-records'] });
    expect(im.listShims().filter(s => s.owner === 'ice-fixture').map(s => s.id)).toEqual(['ice-fixture.ccda', 'ice-fixture.fhir']);
    expect(await im.receiversFor(ALICE)).toContainEqual({ id: 'ice-fixture.health-records', label: 'Health records' });
  });

  test('a C-CDA file goes through the ccda shim into the manager\'s door, as the person', async () => {
    const { im, records } = await loadFixture();
    const run = await im.runImport({
      source: { type: 'upload', files: [{ name: 'visit.xml', bytes: Buffer.from(CCDA('<observation code="bp" value="120/80"/>\n<observation code="hr" value="62"/>')) }] },
      receiver: 'ice-fixture.health-records'
    }, ALICE);
    expect(run.files[0]).toMatchObject({ status: 'imported', chain: ['ice-fixture.ccda'], stored: 2, refs: ['record-1', 'record-2'] });
    expect(records.records).toEqual([
      { owner: 'alice', code: 'bp', value: '120/80', source: 'visit.xml' },
      { owner: 'alice', code: 'hr', value: '62', source: 'visit.xml' }
    ]);
    expect(records.calls.every(c => c.ctx === ALICE)).toBe(true);
  });

  test('a phr-style export: zip unpacked, noise dropped, XML that is not C-CDA unreadable, a partial note kept', async () => {
    const { im, records } = await loadFixture();
    const zip = await packZip([
      { path: 'export/visit-1.xml', bytes: Buffer.from(CCDA('<observation code="bp" value="118/76"/>')) },
      { path: 'export/visit-2.xml', bytes: Buffer.from(CCDA('<observation code="wt" value="70kg"/>', '<unsupported section="meds"/>')) },
      { path: 'export/._visit-1.xml', bytes: Buffer.from('resource fork') },
      { path: 'export/settings.xml', bytes: Buffer.from('<settings theme="dark"/>') }
    ]);
    const run = await im.runImport({ source: { type: 'upload', files: [{ name: 'phr-export.zip', bytes: zip }] }, receiver: 'ice-fixture.health-records' }, ALICE);
    expect(run.files.map(f => [f.name, f.status, f.message])).toEqual([
      ['phr-export.zip/export/visit-1.xml', 'imported', undefined],
      ['phr-export.zip/export/visit-2.xml', 'partial', '1 section(s) could not be read'],
      ['phr-export.zip/export/._visit-1.xml', 'noise', undefined],
      ['phr-export.zip/export/settings.xml', 'unreadable', 'no shim reads this file for ice-fixture.health-records']
    ]);
    expect(records.records.map(r => r.code)).toEqual(['bp', 'wt']);

    // The same export again: every file already taken is unchanged; nothing is stored twice.
    const again = await im.runImport({ source: { type: 'upload', files: [{ name: 'phr-export.zip', bytes: zip }] }, receiver: 'ice-fixture.health-records' }, ALICE);
    expect(again.files.map(f => f.status)).toEqual(['unchanged', 'unchanged', 'noise', 'unreadable']);
    expect(records.records).toHaveLength(2);
  });

  test('FHIR NDJSON: per-item duplicates by resource id', async () => {
    const { im, records } = await loadFixture();
    const ndjson = (ids: number[]) => Buffer.from(ids.map(id => JSON.stringify({ resourceType: 'Observation', id, code: `c${id}`, value: `${id}` })).join('\n'));
    await im.runImport({ source: { type: 'upload', files: [{ name: 'obs.ndjson', bytes: ndjson([1, 2]) }] }, receiver: 'ice-fixture.health-records' }, ALICE);
    const next = await im.runImport({ source: { type: 'upload', files: [{ name: 'obs.ndjson', bytes: ndjson([1, 2, 3]) }] }, receiver: 'ice-fixture.health-records' }, ALICE);
    expect(next.files[0]).toMatchObject({ status: 'imported', chain: ['ice-fixture.fhir'], stored: 1, duplicates: 2 });
    expect(records.records.map(r => r.code)).toEqual(['c1', 'c2', 'c3']);
  });

  test('the manager\'s own rule refuses (D5): nothing stored, the file refused', async () => {
    const { im, records } = await loadFixture();
    records.closed.add('bob');
    const run = await im.runImport({
      source: { type: 'upload', files: [{ name: 'visit.xml', bytes: Buffer.from(CCDA('<observation code="bp" value="1"/>')) }] },
      receiver: 'ice-fixture.health-records'
    }, BOB);
    expect(run.files[0]).toMatchObject({ status: 'refused', message: 'Only you can add to your health record' });
    expect(records.records).toEqual([]);
    expect(await im.receiversFor(BOB)).not.toContainEqual(expect.objectContaining({ id: 'ice-fixture.health-records' }));
  });

  test('keep: the add-on keeps its own originals (phr\'s choice, D11), through its door, as the person', async () => {
    const { im, records } = await loadFixture();
    const ctx = jobContextFromRequest(ALICE as never);
    const run = await im.runImport({
      source: { type: 'upload', files: [{ name: 'visit.xml', bytes: Buffer.from(CCDA('<observation code="bp" value="1"/>')) }] },
      receiver: 'ice-fixture.health-records', original: 'keep'
    }, ctx);
    expect(run.files[0]).toMatchObject({ status: 'imported', original: { name: 'visit.xml', ref: 'original-1' } });
    expect(records.originals).toEqual([{ owner: 'alice', name: 'visit.xml', size: expect.any(Number) }]);
    expect(records.calls.map(c => [c.door, c.ctx])).toEqual([['keepOriginal', ctx], ['add', ctx]]);
  });

  test('the host refuses a shim or receiver the manifest does not declare', async () => {
    const { engine, manifest } = await loadFixture();
    const host = buildAddonHost('ice-fixture', {}, undefined, engine, manifest);
    const shim = { name: 'ccr', direction: 'in' as const, accepts: { extensions: ['.xml'] }, produces: 'x', receivers: [], read: async () => ({ items: [] }) };
    expect(() => host.registerShim(shim)).toThrow(/may register only the shims its manifest declares.*'ccr' is not one of them \(declared: ccda, fhir\)/);
    expect(() => host.registerReceiver({ name: 'notes', accepts: ['x'], mayUse: async () => true, receive: async () => ({ status: 'stored' }) }))
      .toThrow(/may register only the receivers its manifest declares/);
    // With no manifest, nothing may be registered.
    expect(() => buildAddonHost('ice-fixture', {}, undefined, engine).registerShim(shim)).toThrow(/declared: none/);
  });

  test('the test kit\'s host registers too, given an engine and the manifest; without an engine it says why', async () => {
    const { engine, manifest, im } = await loadFixture();
    const shim = { name: 'fhir', direction: 'in' as const, accepts: { extensions: ['.json'] }, produces: 'x', receivers: [], read: async () => ({ items: [] }) };
    // Already registered by the add-on: the engine's own refusal comes through.
    expect(() => kitBuildAddonHost('ice-fixture', {}, undefined, engine, manifest).registerShim(shim)).toThrow(/already registered/);
    expect(im.listShims().some(s => s.id === 'ice-fixture.fhir')).toBe(true);
    expect(() => kitBuildAddonHost('ice-fixture', {}, undefined, undefined, manifest).registerShim(shim)).toThrow(/built without a site's ImportManager/);
  });
});
