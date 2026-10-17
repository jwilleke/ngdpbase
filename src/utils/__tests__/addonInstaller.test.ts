/**
 * The add-on installer (#1830) against a fake registry and a fake provenance
 * check: no socket is opened. The real provenance check is tested with real
 * cryptography in addonProvenance.test.ts. Each test works in its own mkdtemp
 * folder, and teardown removes only that folder.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { gunzipSync, gzipSync } from 'zlib';
import { installConfiguredAddons, type InstallerOptions, type InstallRecord } from '../addonInstaller';
import { readLockSync } from '../addonLock';
import { readTarball, safeEntryPath } from '../addonTarball';
import { REGISTRY, REPO, addonTgz, fakeAttestations, fakeProvenance, fakeRegistry, makeTgz, sri } from '../../test-support/fakeRegistry';

const readLock = (dir: string) => Promise.resolve(readLockSync(dir));

const PKG = '@acme/ledger-addon';
const pkg = (version: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: PKG, version, ngdpbase: { slug: 'ledger', ...extra }
});

let tmp: string;
let addonsDir: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'addon-installer-'));
  addonsDir = path.join(tmp, 'addons');
});

afterEach(async () => {
  await fs.remove(tmp);
});

const options = (fetch: InstallerOptions['fetch'], over: Partial<InstallerOptions> = {}): InstallerOptions => ({
  addonsDir,
  registry: REGISTRY,
  coreVersion: '5.13.0',
  maxPackumentBytes: 1024 * 1024,
  maxTarballBytes: 1024 * 1024,
  maxUnpackedBytes: 1024 * 1024,
  fetch,
  checkProvenance: fakeProvenance().check,
  now: () => new Date('2026-10-16T12:00:00.000Z'),
  ...over
});

const spec = { ledger: { package: PKG, version: '^1', repository: REPO } };

describe('addonInstaller (#1830)', () => {
  test('an empty map does nothing: no folder, no request', async () => {
    const reg = fakeRegistry({});
    expect(await installConfiguredAddons({}, options(reg.fetch))).toEqual([]);
    expect(reg.calls).toEqual([]);
    expect(await fs.pathExists(addonsDir)).toBe(false);
  });

  test('installs the highest release in range, unpacked and pinned in the lock', async () => {
    const reg = fakeRegistry({ [PKG]: {
      '1.0.0': { tgz: addonTgz(pkg('1.0.0')) },
      '1.4.2': { tgz: addonTgz(pkg('1.4.2'), [{ name: 'package/lib/a.js', data: 'export const a = 1;\n' }]) },
      '2.0.0': { tgz: addonTgz(pkg('2.0.0')) }
    } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome).toMatchObject({ slug: 'ledger', status: 'installed', version: '1.4.2' });
    expect(JSON.parse(await fs.readFile(path.join(addonsDir, 'ledger', 'package.json'), 'utf8')).version).toBe('1.4.2');
    expect(await fs.readFile(path.join(addonsDir, 'ledger', 'lib', 'a.js'), 'utf8')).toContain('a = 1');
    const lock = await readLock(addonsDir);
    expect(lock.addons.ledger).toEqual({
      package: PKG,
      version: '1.4.2',
      integrity: sri(addonTgz(pkg('1.4.2'), [{ name: 'package/lib/a.js', data: 'export const a = 1;\n' }])),
      installedAt: '2026-10-16T12:00:00.000Z',
      provenance: { repository: 'github.com/acme/ledger', verifiedAt: '2026-10-16T12:00:00.000Z' }
    });
  });

  test('a tarball whose sha512 does not match dist.integrity is refused, nothing written', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')), integrity: sri(Buffer.from('something else')) } } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toMatch(/does not match its sha512 integrity/);
    expect(await fs.pathExists(path.join(addonsDir, 'ledger'))).toBe(false);
    expect((await readLock(addonsDir)).addons).toEqual({});
  });

  test('a path that leaves the package refuses the whole tarball', async () => {
    const evil = makeTgz([
      { name: 'package/package.json', data: JSON.stringify(pkg('1.0.0')) },
      { name: 'package/../../escaped.js', data: 'pwned' }
    ]);
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: evil } } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toMatch(/leaves the package/);
    expect(await fs.pathExists(path.join(tmp, 'escaped.js'))).toBe(false);
    expect(await fs.pathExists(path.join(addonsDir, 'ledger'))).toBe(false);
  });

  test('a symbolic link refuses the whole tarball', async () => {
    const evil = makeTgz([
      { name: 'package/package.json', data: JSON.stringify(pkg('1.0.0')) },
      { name: 'package/data', type: '2', linkname: '/etc' }
    ]);
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: evil } } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome.reason).toMatch(/symbolic link/);
    expect(await fs.pathExists(path.join(addonsDir, 'ledger'))).toBe(false);
  });

  test('size limits: a tarball over the download cap, or one that unpacks past the unpacked cap, is refused', async () => {
    const big = addonTgz(pkg('1.0.0'), [{ name: 'package/blob.bin', data: Buffer.alloc(300 * 1024, 7) }]);
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: big } } });

    const [unpacked] = await installConfiguredAddons(spec, options(reg.fetch, { maxUnpackedBytes: 100 * 1024 }));
    expect(unpacked.status).toBe('skipped');
    expect(unpacked.reason).toMatch(/unpacks to more than 102400 bytes/);

    const [download] = await installConfiguredAddons(spec, options(reg.fetch, { maxTarballBytes: 64 }));
    expect(download.status).toBe('skipped');
    expect(download.reason).toMatch(/too large/);
    expect(download.registryUnreachable).toBeUndefined();
    expect(await fs.pathExists(path.join(addonsDir, 'ledger'))).toBe(false);
  });

  test('a later start uses the installed copy after checking it against the lock, with no registry call', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')) } } });
    await installConfiguredAddons(spec, options(reg.fetch));
    reg.calls.length = 0;
    reg.down = true;

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'verified', version: '1.0.0' });
    expect(reg.calls).toEqual([]);
  });

  test('a later release in range is not picked up on restart: pinned', async () => {
    const versions: Record<string, { tgz: Buffer }> = { '1.0.0': { tgz: addonTgz(pkg('1.0.0')) } };
    const reg = fakeRegistry({ [PKG]: versions });
    await installConfiguredAddons(spec, options(reg.fetch));
    versions['1.1.0'] = { tgz: addonTgz(pkg('1.1.0')) };

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'verified', version: '1.0.0' });
  });

  test('an edited installed file is rewritten from the verified tarball', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')) } } });
    await installConfiguredAddons(spec, options(reg.fetch));
    const index = path.join(addonsDir, 'ledger', 'index.js');
    await fs.writeFile(index, 'tampered');
    await fs.writeFile(path.join(addonsDir, 'ledger', 'extra.js'), 'added');

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome.status).toBe('repaired');
    expect(await fs.readFile(index, 'utf8')).toContain('register()');
    expect(await fs.pathExists(path.join(addonsDir, 'ledger', 'extra.js'))).toBe(false);
  });

  test('a stored tarball that fails its sha512 sets the folder aside, so it is not loaded', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')) } } });
    await installConfiguredAddons(spec, options(reg.fetch));
    await fs.writeFile(path.join(addonsDir, '.packages', 'ledger-1.0.0.tgz'), 'not the tarball');

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toMatch(/does not match the sha512 in the lock file/);
    expect(await fs.pathExists(path.join(addonsDir, 'ledger'))).toBe(false);
    expect((await fs.readdir(addonsDir)).some((n) => n.startsWith('.rejected-ledger-'))).toBe(true);
  });

  test('registry down on a first install: skipped as unreachable, nothing written', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')) } } });
    reg.down = true;

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome).toMatchObject({ slug: 'ledger', status: 'skipped', registryUnreachable: true });
    expect(outcome.reason).toMatch(/registry unreachable/);
    expect(await fs.pathExists(path.join(addonsDir, 'ledger'))).toBe(false);
  });

  test('minVersion: the highest release this core can run is installed, and the one passed over is named', async () => {
    const reg = fakeRegistry({ [PKG]: {
      '1.0.0': { tgz: addonTgz(pkg('1.0.0', { minVersion: '5.0.0' })), manifest: { ngdpbase: { slug: 'ledger', minVersion: '5.0.0' } } },
      '1.1.0': { tgz: addonTgz(pkg('1.1.0', { minVersion: '6.0.0' })), manifest: { ngdpbase: { slug: 'ledger', minVersion: '6.0.0' } } }
    } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'installed', version: '1.0.0' });
    expect(outcome.reason).toMatch(/1\.1\.0 needs ngdpbase 6\.0\.0 or later/);
  });

  test('minVersion: when no release in range fits this core, it is skipped with the version it needs', async () => {
    const reg = fakeRegistry({ [PKG]: {
      '1.1.0': { tgz: addonTgz(pkg('1.1.0', { minVersion: '6.0.0' })), manifest: { ngdpbase: { slug: 'ledger', minVersion: '6.0.0' } } }
    } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toMatch(/needs ngdpbase 6\.0\.0 or later; this is 5\.13\.0/);
  });

  test('minVersion is re-checked in the tarball: the registry metadata is not trusted alone', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0', { minVersion: '9.0.0' })), manifest: { ngdpbase: { slug: 'ledger' } } } } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toMatch(/needs ngdpbase 9\.0\.0/);
  });

  test('a tarball naming another package or slug is refused', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz({ name: PKG, version: '1.0.0', ngdpbase: { slug: 'other' } }) } } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome.reason).toMatch(/declares slug 'other'/);
  });

  test('a folder already there that the installer did not install is left alone', async () => {
    await fs.ensureDir(path.join(addonsDir, 'ledger'));
    await fs.writeFile(path.join(addonsDir, 'ledger', 'index.js'), 'mine');
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')) } } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome.status).toBe('skipped');
    expect(reg.calls).toEqual([]);
    expect(await fs.readFile(path.join(addonsDir, 'ledger', 'index.js'), 'utf8')).toBe('mine');
  });

  test('bad entries are reported per add-on and do not stop the others', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')) } } });
    const outcomes = await installConfiguredAddons({
      'Bad Slug': { package: PKG, version: '1', repository: REPO },
      nopkg: { package: 'NOT A NAME', version: '1', repository: REPO },
      tagged: { package: PKG, version: 'latest', repository: REPO },
      norepo: { package: PKG, version: '1' },
      ledger: { package: PKG, version: '1.0.0', repository: REPO }
    }, options(reg.fetch));

    expect(outcomes.map((o) => o.status)).toEqual(['skipped', 'skipped', 'skipped', 'skipped', 'installed']);
    expect(outcomes[3].reason).toMatch(/no "repository"/);
  });

  test('a tarball on another origin than the registry is refused', async () => {
    const tgz = addonTgz(pkg('1.0.0'));
    const fetch: InstallerOptions['fetch'] = (url) => Promise.resolve(url === `${REGISTRY}/@acme%2fledger-addon`
      ? { status: 200, body: Buffer.from(JSON.stringify({ name: PKG, versions: { '1.0.0': { name: PKG, version: '1.0.0', dist: { tarball: 'https://elsewhere.test/x.tgz', integrity: sri(tgz) } } } })) }
      : { status: 404, body: Buffer.alloc(0) });

    const [outcome] = await installConfiguredAddons(spec, options(fetch));

    expect(outcome.reason).toMatch(/not on the configured registry/);
  });
});

describe('provenance and the audit hook (#1830)', () => {
  test('the provenance check is asked about this exact tarball and the configured repository', async () => {
    const tgz = addonTgz(pkg('1.0.0'));
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz } } });
    const prov = fakeProvenance();

    await installConfiguredAddons(spec, options(reg.fetch, { checkProvenance: prov.check }));

    expect(prov.seen).toEqual([{ name: PKG, version: '1.0.0', sha512Hex: Buffer.from(sri(tgz).slice('sha512-'.length), 'base64').toString('hex'), repository: REPO }]);
    expect(reg.calls).toContain(`${REGISTRY}/-/npm/v1/attestations/${PKG}@1.0.0`);
  });

  test('missing provenance refuses the install', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')), attestations: false } } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'skipped', failedCheck: 'provenance' });
    expect(outcome.reason).toMatch(/no provenance attestation/);
    expect(await fs.pathExists(path.join(addonsDir, 'ledger'))).toBe(false);
  });

  test('provenance from another repository refuses the install', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')), attestations: fakeAttestations('github.com/evil/fork') } } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'skipped', failedCheck: 'provenance' });
    expect(await fs.pathExists(path.join(addonsDir, 'ledger'))).toBe(false);
    expect((await readLock(addonsDir)).addons).toEqual({});
  });

  test('a provenance check that cannot be made (trust root unreachable) is a retry, not a refusal', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')) } } });

    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch, { checkProvenance: () => Promise.reject(new Error('ENOTFOUND tuf-repo-cdn.sigstore.dev')) }));

    expect(outcome).toMatchObject({ status: 'skipped', registryUnreachable: true });
    expect(outcome.failedCheck).toBeUndefined();
  });

  test('changing the configured repository reinstalls rather than trusting the old pin', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')) } } });
    await installConfiguredAddons(spec, options(reg.fetch));

    const [outcome] = await installConfiguredAddons({ ledger: { ...spec.ledger, repository: 'github.com/acme/other' } }, options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'skipped', failedCheck: 'provenance' });
  });

  test('beforeInstall gets the verified record, and when it throws nothing is written', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')) } } });
    const records: InstallRecord[] = [];

    const [refused] = await installConfiguredAddons(spec, options(reg.fetch, { beforeInstall: (r) => { records.push(r); return Promise.reject(new Error('audit sink refused')); } }));

    expect(records).toEqual([{ slug: 'ledger', package: PKG, version: '1.0.0', integrity: sri(addonTgz(pkg('1.0.0'))), repository: 'github.com/acme/ledger' }]);
    expect(refused).toMatchObject({ status: 'skipped', reason: 'audit sink refused' });
    expect(await fs.pathExists(path.join(addonsDir, 'ledger'))).toBe(false);
    expect(await fs.pathExists(path.join(addonsDir, '.packages'))).toBe(false);
    expect((await readLock(addonsDir)).addons).toEqual({});
  });

  test('refusals name the check that refused', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': { tgz: addonTgz(pkg('1.0.0')), integrity: sri(Buffer.from('x')) } } });
    const [outcome] = await installConfiguredAddons(spec, options(reg.fetch));
    expect(outcome.failedCheck).toBe('integrity');
  });
});

describe('addonTarball (#1830)', () => {
  test('safeEntryPath strips package/ and refuses anything that could leave the folder', () => {
    expect(safeEntryPath('package/lib/a.js')).toBe('lib/a.js');
    expect(safeEntryPath('package/')).toBe('');
    expect(() => safeEntryPath('/etc/passwd')).toThrow(/absolute/);
    expect(() => safeEntryPath('package/../x')).toThrow(/leaves/);
    expect(() => safeEntryPath('package\\..\\x')).toThrow(/unsafe/);
  });

  test('long names via pax headers are read', async () => {
    const long = `package/${'d/'.repeat(60)}file.js`;
    const files = await readTarball(makeTgz([{ name: long, data: 'x' }]), 1024 * 1024);
    expect([...files.keys()]).toEqual([long.slice('package/'.length)]);
  });

  test('a hard link is refused', async () => {
    await expect(readTarball(makeTgz([{ name: 'package/a', type: '1', linkname: 'package/b' }]), 1024 * 1024)).rejects.toThrow(/hard link/);
  });

  test('a corrupted header is refused', async () => {
    const tgz = makeTgz([{ name: 'package/a.js', data: 'x' }, { name: 'package/b.js', data: 'y' }]);
    const tar = gunzipSync(tgz);
    tar[512 + 512] = 'q'.charCodeAt(0);
    await expect(readTarball(gzipSync(tar), 1024 * 1024)).rejects.toThrow(/refused/);
  });
});
