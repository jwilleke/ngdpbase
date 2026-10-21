/**
 * #1953: a first boot that refuses for a missing required setting must refuse
 * before anything is written. NGDPBASE_SYSTEM_USER used to be checked in app.ts
 * after engine.initialize(), by which time the bootstrap admin existed without
 * its person record — and every later boot found the admin and never made one.
 *
 * Each test runs on its own mkdtemp data folder; teardown removes only that.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import WikiEngine from '../WikiEngine';
import type UserManager from '../managers/UserManager';
import type PersonManager from '../managers/PersonManager';
import { systemPrincipalFromConfig } from '../security/PolicyInformationPoint';
import { assertHeadlessBootstrapPassword } from '../utils/headlessAdminPassword';
import { becomeRunAsUser } from '../utils/runAsUser';

// The real user store, so the first boot creates the bootstrap admin (the
// shared mock reports no store, and the admin is never made).
vi.unmock('../providers/FileUserProvider');

const SETUP_POINTER = /SETUP\.md#required-settings/;
const SAVED = ['FAST_STORAGE', 'SLOW_STORAGE', 'NGDPBASE_SYSTEM_USER'] as const;

describe('required settings refuse before anything is written (#1953)', () => {
  let dataDir: string;
  let started: { shutdown(): Promise<void> } | null;
  const saved: Partial<Record<(typeof SAVED)[number], string>> = {};

  beforeEach(() => {
    for (const name of SAVED) saved[name] = process.env[name];
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1953-'));
    process.env.FAST_STORAGE = dataDir;
    process.env.SLOW_STORAGE = dataDir;
    started = null;
  });

  afterEach(async () => {
    await started?.shutdown().catch(() => undefined);
    for (const name of SAVED) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    // Only this test's own mkdtemp folder.
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  test('without NGDPBASE_SYSTEM_USER the engine refuses with no account, person or page written', async () => {
    delete process.env.NGDPBASE_SYSTEM_USER;
    const engine = new WikiEngine();
    started = engine;

    await expect(engine.initialize({})).rejects.toThrow(/NGDPBASE_SYSTEM_USER is not set/);
    expect(fs.readdirSync(dataDir)).toEqual([]);
  });

  test('with it set, the same first boot writes the admin and its person together', async () => {
    process.env.NGDPBASE_SYSTEM_USER = 'system';
    const engine = new WikiEngine();
    started = engine;
    await engine.initialize({});

    const users = engine.getManager<UserManager>('UserManager');
    const persons = engine.getManager<PersonManager>('PersonManager');
    expect(await users?.getUser('admin')).toBeTruthy();
    expect(await persons?.getByIdentifier('admin')).toBeTruthy();
  }, 60_000);

  test('every required-setting refusal points to SETUP.md', () => {
    expect(() => systemPrincipalFromConfig({ getProperty: () => { throw new Error('unset'); } })).toThrow(SETUP_POINTER);
    expect(() => systemPrincipalFromConfig({ getProperty: () => '  ' })).toThrow(SETUP_POINTER);
    expect(() => assertHeadlessBootstrapPassword('admin123', true)).toThrow(SETUP_POINTER);
    expect(() => becomeRunAsUser({}, dataDir, dataDir)).toThrow(SETUP_POINTER);
  });
});
