/**
 * The admin Update for installed add-ons (#2100), against a fake registry and
 * a fake provenance check: no socket is opened. An Update checks a release as
 * a first install does and stages it; the next start switches to it and keeps
 * the previous release until AddonsManager confirms the new one loaded, or
 * falls back to it. A restart never asks the registry for a newer release.
 * Each test works in its own mkdtemp folder, and teardown removes only that.
 */
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

/**
 * The lock file's writes, made to fail on demand: `fail` throws before
 * anything is written, `crash-after` writes and then throws, as a process
 * stopping right after the write would leave things.
 */
const lockWrite = vi.hoisted((): { mode: 'ok' | 'fail' | 'crash-after' } => ({ mode: 'ok' }));
vi.mock('../atomicWrite', async (importOriginal) => {
  const real = await importOriginal<typeof import('../atomicWrite')>();
  const writeFileAtomic = async (file: string, data: string | Buffer): Promise<void> => {
    if (file.endsWith('addons-lock.json') && lockWrite.mode === 'fail') throw new Error('disk full');
    await real.writeFileAtomic(file, data);
    if (file.endsWith('addons-lock.json') && lockWrite.mode === 'crash-after') throw new Error('process stopped');
  };
  return { ...real, writeFileAtomic, default: writeFileAtomic };
});

import {
  checkForUpdates,
  confirmUpdate,
  installConfiguredAddons,
  rollBackUpdate,
  stageUpdate,
  FINISH_LAST_UPDATE,
  type InstallerOptions,
  type InstallRecord
} from '../addonInstaller';
import { readLockSync } from '../addonLock';
import { REGISTRY, addonTgz, fakeAttestations, fakeProvenance, fakeRegistry, sri, type FakeVersion } from '../../test-support/fakeRegistry';

const PKG = '@acme/ledger-addon';
const pkg = (version: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: PKG, version, ngdpbase: { slug: 'ledger', ...extra }
});
const release = (version: string, extra: Record<string, unknown> = {}): FakeVersion => ({ tgz: addonTgz(pkg(version, extra)) });
const SPEC = { ledger: { package: PKG, version: '^1', repository: 'github.com/acme/ledger' } };

let tmp: string;
let addonsDir: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'addon-update-'));
  addonsDir = path.join(tmp, 'addons');
});

afterEach(async () => {
  lockWrite.mode = 'ok';
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
  now: () => new Date('2026-10-28T12:00:00.000Z'),
  ...over
});

const installedVersion = async (): Promise<string> => JSON.parse(await fs.readFile(path.join(addonsDir, 'ledger', 'package.json'), 'utf8')).version as string;
const tgz = (version: string): string => path.join(addonsDir, '.packages', `ledger-${version}.tgz`);

/** 1.0.0 installed; the registry then holds `later` as well. */
async function installedAt100(later: Record<string, FakeVersion>): Promise<ReturnType<typeof fakeRegistry>> {
  const first = fakeRegistry({ [PKG]: { '1.0.0': release('1.0.0') } });
  const [outcome] = await installConfiguredAddons(SPEC, options(first.fetch));
  expect(outcome.status).toBe('installed');
  return fakeRegistry({ [PKG]: { '1.0.0': release('1.0.0'), ...later } });
}

describe('a restart never updates (#2100)', () => {
  test('a newer release in range on the registry: the next start uses the pinned one and asks nothing', async () => {
    const reg = await installedAt100({ '1.1.0': release('1.1.0') });

    const [outcome] = await installConfiguredAddons(SPEC, options(reg.fetch));

    // Sabotage: making lockAnswers return false sent this start to the registry and installed 1.1.0 (red).
    expect(outcome).toMatchObject({ status: 'verified', version: '1.0.0' });
    expect(reg.calls).toEqual([]);
    expect(await installedVersion()).toBe('1.0.0');
  });
});

describe('checkForUpdates (#2100)', () => {
  test('pinned, range, newest in range and the release Update would install; nothing written', async () => {
    const reg = await installedAt100({ '1.1.0': release('1.1.0'), '1.2.0': release('1.2.0'), '2.0.0': release('2.0.0') });
    const lockBefore = await fs.readFile(path.join(addonsDir, 'addons-lock.json'), 'utf8');

    const [check] = await checkForUpdates(SPEC, options(reg.fetch));

    expect(check).toEqual({ slug: 'ledger', package: PKG, range: '^1', pinned: '1.0.0', newest: '1.2.0', available: '1.2.0' });
    expect(reg.calls).toEqual([`${REGISTRY}/@acme%2fledger-addon`]);
    expect(await fs.readFile(path.join(addonsDir, 'addons-lock.json'), 'utf8')).toBe(lockBefore);
  });

  test('up to date: no available release', async () => {
    const reg = await installedAt100({});
    const [check] = await checkForUpdates(SPEC, options(reg.fetch));
    expect(check).toEqual({ slug: 'ledger', package: PKG, range: '^1', pinned: '1.0.0', newest: '1.0.0' });
  });

  test('the newest needs a newer ngdpbase: shown as needsCore, and Update offers the newest this core can run', async () => {
    const reg = await installedAt100({ '1.1.0': release('1.1.0'), '1.2.0': { tgz: addonTgz(pkg('1.2.0', { minVersion: '6.0.0' })), manifest: { ngdpbase: { slug: 'ledger', minVersion: '6.0.0' } } } });

    const [check] = await checkForUpdates(SPEC, options(reg.fetch));

    // Sabotage: dropping the needsNewerCore test offered 1.2.0 as available (red).
    expect(check).toMatchObject({ newest: '1.2.0', available: '1.1.0', needsCore: { version: '1.2.0', minVersion: '6.0.0' } });
  });

  test('registry unreachable: says so, keeps what is pinned, throws nothing', async () => {
    const reg = await installedAt100({ '1.1.0': release('1.1.0') });
    reg.down = true;

    const [check] = await checkForUpdates(SPEC, options(reg.fetch));

    expect(check).toEqual({ slug: 'ledger', package: PKG, range: '^1', pinned: '1.0.0', registryUnreachable: true });
  });

  test('an add-on not installed yet is not checked against the registry', async () => {
    const reg = fakeRegistry({ [PKG]: { '1.0.0': release('1.0.0') } });
    const [check] = await checkForUpdates(SPEC, options(reg.fetch));
    expect(check.problem).toMatch(/not installed yet/);
    expect(reg.calls).toEqual([]);
  });
});

describe('stageUpdate (#2100)', () => {
  test('verifies and downloads the release, records it as pending, leaves the running folder alone', async () => {
    const reg = await installedAt100({ '1.1.0': release('1.1.0') });
    const records: InstallRecord[] = [];

    const outcome = await stageUpdate('ledger', SPEC.ledger, '1.1.0', options(reg.fetch, { beforeInstall: (r) => { records.push(r); return Promise.resolve(); } }));

    expect(outcome).toEqual({ slug: 'ledger', package: PKG, version: '1.1.0', status: 'staged', previousVersion: '1.0.0' });
    expect(records).toEqual([expect.objectContaining({ slug: 'ledger', version: '1.1.0', previousVersion: '1.0.0', integrity: sri(release('1.1.0').tgz) })]);
    const entry = readLockSync(addonsDir).addons.ledger;
    expect(entry.version).toBe('1.0.0');
    expect(entry.pending).toEqual({
      version: '1.1.0',
      integrity: sri(release('1.1.0').tgz),
      installedAt: '2026-10-28T12:00:00.000Z',
      provenance: { repository: 'github.com/acme/ledger', verifiedAt: '2026-10-28T12:00:00.000Z' }
    });
    expect(await fs.pathExists(tgz('1.1.0'))).toBe(true);
    expect(await installedVersion()).toBe('1.0.0');
  });

  test.each([
    ['outside the range', '2.0.0', /outside the configured range/],
    ['not newer', '1.0.0', /not newer than 1\.0\.0/],
    ['not a release', '1.1.0-beta.1', /not a release version/]
  ])('refuses a version %s, asking the registry nothing', async (_what, version, reason) => {
    const reg = await installedAt100({ '1.1.0': release('1.1.0'), '2.0.0': release('2.0.0') });
    const outcome = await stageUpdate('ledger', SPEC.ledger, version, options(reg.fetch));
    expect(outcome.status).toBe('refused');
    expect(outcome.reason).toMatch(reason);
    expect(reg.calls).toEqual([]);
    expect(readLockSync(addonsDir).addons.ledger.pending).toBeUndefined();
  });

  test('a release that needs a newer ngdpbase is refused, nothing downloaded', async () => {
    const reg = await installedAt100({ '1.1.0': { tgz: addonTgz(pkg('1.1.0', { minVersion: '6.0.0' })), manifest: { ngdpbase: { slug: 'ledger', minVersion: '6.0.0' } } } });

    const outcome = await stageUpdate('ledger', SPEC.ledger, '1.1.0', options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'refused', reason: expect.stringMatching(/needs ngdpbase 6\.0\.0 or later/) });
    // Sabotage: dropping the packument minVersion check fetched the tarball before refusing (red).
    expect(reg.calls.filter((u) => u.endsWith('.tgz'))).toEqual([]);
    expect(await fs.pathExists(tgz('1.1.0'))).toBe(false);
  });

  test('the same checks as a first install: a sha512 mismatch is refused', async () => {
    const reg = await installedAt100({ '1.1.0': { tgz: addonTgz(pkg('1.1.0')), integrity: sri(Buffer.from('other')) } });

    const outcome = await stageUpdate('ledger', SPEC.ledger, '1.1.0', options(reg.fetch));

    // Sabotage: skipping the integrity comparison in fetchVerified staged it (red).
    expect(outcome).toMatchObject({ status: 'refused', failedCheck: 'integrity' });
    expect(readLockSync(addonsDir).addons.ledger.pending).toBeUndefined();
    expect(await fs.pathExists(tgz('1.1.0'))).toBe(false);
  });

  test('the same checks as a first install: provenance from another repository is refused', async () => {
    const reg = await installedAt100({ '1.1.0': { tgz: addonTgz(pkg('1.1.0')), attestations: fakeAttestations('github.com/evil/ledger') } });

    const outcome = await stageUpdate('ledger', SPEC.ledger, '1.1.0', options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'refused', failedCheck: 'provenance' });
    expect(readLockSync(addonsDir).addons.ledger.pending).toBeUndefined();
  });

  test('registry unreachable: refused with registryUnreachable, the site stays on its version', async () => {
    const reg = await installedAt100({ '1.1.0': release('1.1.0') });
    reg.down = true;

    const outcome = await stageUpdate('ledger', SPEC.ledger, '1.1.0', options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'refused', registryUnreachable: true });
    expect(readLockSync(addonsDir).addons.ledger).toMatchObject({ version: '1.0.0' });
    expect(readLockSync(addonsDir).addons.ledger.pending).toBeUndefined();
  });

  test('a record that cannot be written stops the Update before anything is written', async () => {
    const reg = await installedAt100({ '1.1.0': release('1.1.0') });

    await expect(stageUpdate('ledger', SPEC.ledger, '1.1.0', options(reg.fetch, { beforeInstall: () => Promise.reject(new Error('audit sink down')) })))
      .rejects.toThrow('audit sink down');

    expect(await fs.pathExists(tgz('1.1.0'))).toBe(false);
    expect(readLockSync(addonsDir).addons.ledger.pending).toBeUndefined();
  });
});

describe('the next start, and the fall-back (#2100)', () => {
  async function staged(): Promise<ReturnType<typeof fakeRegistry>> {
    const reg = await installedAt100({ '1.1.0': release('1.1.0') });
    expect((await stageUpdate('ledger', SPEC.ledger, '1.1.0', options(reg.fetch))).status).toBe('staged');
    reg.calls.length = 0;
    return reg;
  }

  test('switches to the staged release with no registry call, keeping the previous one', async () => {
    const reg = await staged();
    reg.down = true;

    const [outcome] = await installConfiguredAddons(SPEC, options(reg.fetch));

    expect(outcome).toEqual({ slug: 'ledger', package: PKG, version: '1.1.0', status: 'updated', previousVersion: '1.0.0' });
    expect(reg.calls).toEqual([]);
    expect(await installedVersion()).toBe('1.1.0');
    const entry = readLockSync(addonsDir).addons.ledger;
    expect(entry).toMatchObject({ version: '1.1.0', previous: { version: '1.0.0' } });
    expect(entry.pending).toBeUndefined();
    expect(JSON.parse(await fs.readFile(path.join(addonsDir, '.previous-ledger', 'package.json'), 'utf8')).version).toBe('1.0.0');
    expect(await fs.pathExists(tgz('1.0.0'))).toBe(true);
  });

  test('confirmUpdate removes the previous release once the new one loaded', async () => {
    const reg = await staged();
    await installConfiguredAddons(SPEC, options(reg.fetch));

    await confirmUpdate(addonsDir, 'ledger');

    expect(readLockSync(addonsDir).addons.ledger.previous).toBeUndefined();
    expect(await fs.pathExists(path.join(addonsDir, '.previous-ledger'))).toBe(false);
    expect(await fs.pathExists(tgz('1.0.0'))).toBe(false);
    expect(await fs.pathExists(tgz('1.1.0'))).toBe(true);
    // And the start after that verifies 1.1.0 as installed.
    const [again] = await installConfiguredAddons(SPEC, options(reg.fetch));
    expect(again).toMatchObject({ status: 'verified', version: '1.1.0' });
  });

  test('rollBackUpdate restores the previous release on disk and in the lock', async () => {
    const reg = await staged();
    await installConfiguredAddons(SPEC, options(reg.fetch));

    expect(await rollBackUpdate(addonsDir, 'ledger')).toEqual({ from: '1.1.0', to: '1.0.0' });

    // Sabotage: not renaming .previous-ledger back left 1.1.0 in place (red).
    expect(await installedVersion()).toBe('1.0.0');
    const entry = readLockSync(addonsDir).addons.ledger;
    expect(entry).toMatchObject({ version: '1.0.0', integrity: sri(release('1.0.0').tgz) });
    expect(entry.previous).toBeUndefined();
    expect(await fs.pathExists(tgz('1.1.0'))).toBe(false);
    const [again] = await installConfiguredAddons(SPEC, options(reg.fetch));
    expect(again).toMatchObject({ status: 'verified', version: '1.0.0' });
    expect(reg.calls).toEqual([]);
  });

  test('a switch an earlier start never confirmed (the process stopped) falls back at the next start, before loading', async () => {
    const reg = await staged();
    await installConfiguredAddons(SPEC, options(reg.fetch));   // switched, never confirmed

    const [outcome] = await installConfiguredAddons(SPEC, options(reg.fetch));

    // Sabotage: skipping undoSwitch at start kept 1.1.0 (red).
    expect(outcome).toMatchObject({ status: 'verified', version: '1.0.0', rolledBack: { from: '1.1.0', to: '1.0.0' } });
    expect(await installedVersion()).toBe('1.0.0');
    expect(reg.calls).toEqual([]);
  });

  test('a staged tarball that no longer matches its sha512 is discarded; the installed release stays', async () => {
    const reg = await staged();
    await fs.writeFile(tgz('1.1.0'), Buffer.from('tampered'));

    const [outcome] = await installConfiguredAddons(SPEC, options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'verified', version: '1.0.0', notice: expect.stringMatching(/does not match the sha512/) });
    expect(readLockSync(addonsDir).addons.ledger.pending).toBeUndefined();
    expect(await fs.pathExists(tgz('1.1.0'))).toBe(false);
    expect(await installedVersion()).toBe('1.0.0');
  });

  test('a staged release the configuration no longer allows is discarded', async () => {
    const reg = await staged();

    const [outcome] = await installConfiguredAddons({ ledger: { ...SPEC.ledger, version: '~1.0.0' } }, options(reg.fetch));

    expect(outcome).toMatchObject({ status: 'verified', version: '1.0.0', notice: expect.stringMatching(/no longer matches/) });
    expect(readLockSync(addonsDir).addons.ledger.pending).toBeUndefined();
  });
  test('confirm: a crash right after the lock is written leaves the new release running at the next start', async () => {
    const reg = await staged();
    await installConfiguredAddons(SPEC, options(reg.fetch));
    lockWrite.mode = 'crash-after';

    await expect(confirmUpdate(addonsDir, 'ledger')).rejects.toThrow('process stopped');
    lockWrite.mode = 'ok';
    const [outcome] = await installConfiguredAddons(SPEC, options(reg.fetch));

    // Sabotage: writing the lock before dropping `previous` from it made this start fall back to 1.0.0 (red).
    expect(outcome).toMatchObject({ status: 'verified', version: '1.1.0' });
    expect(outcome.rolledBack).toBeUndefined();
    expect(await installedVersion()).toBe('1.1.0');
    expect(reg.calls).toEqual([]);
  });

  test('confirm: a lock write that fails keeps the previous release whole, so the next start falls back to a release it can run', async () => {
    const reg = await staged();
    await installConfiguredAddons(SPEC, options(reg.fetch));
    lockWrite.mode = 'fail';

    await expect(confirmUpdate(addonsDir, 'ledger')).rejects.toThrow('disk full');
    lockWrite.mode = 'ok';
    // Nothing on disk says the switch was confirmed, so it is undone: never skipped.
    expect(await fs.pathExists(path.join(addonsDir, '.previous-ledger'))).toBe(true);
    expect(await fs.pathExists(tgz('1.0.0'))).toBe(true);
    const [outcome] = await installConfiguredAddons(SPEC, options(reg.fetch));

    // Sabotage: the old order (files first, then the lock) left `previous` naming deleted files; this start skipped the add-on (red).
    expect(outcome).toMatchObject({ status: 'verified', version: '1.0.0', rolledBack: { from: '1.1.0', to: '1.0.0' } });
    expect(await installedVersion()).toBe('1.0.0');
  });

  test('an Update is refused while the last one is not settled, so the next start cannot drop it', async () => {
    const reg = await installedAt100({ '1.1.0': release('1.1.0'), '1.2.0': release('1.2.0') });
    expect((await stageUpdate('ledger', SPEC.ledger, '1.1.0', options(reg.fetch))).status).toBe('staged');
    await installConfiguredAddons(SPEC, options(reg.fetch));   // switched to 1.1.0; `previous` set, not yet confirmed
    reg.calls.length = 0;

    const outcome = await stageUpdate('ledger', SPEC.ledger, '1.2.0', options(reg.fetch));

    // Sabotage: without the `previous` check 1.2.0 was staged, then dropped by the fall-back at the next start (red).
    expect(outcome).toMatchObject({ status: 'refused', reason: FINISH_LAST_UPDATE });
    expect(reg.calls).toEqual([]);
    expect(readLockSync(addonsDir).addons.ledger.pending).toBeUndefined();
    const [check] = await checkForUpdates(SPEC, options(reg.fetch));
    expect(check).toMatchObject({ pinned: '1.1.0', blocked: FINISH_LAST_UPDATE });
  });
});
