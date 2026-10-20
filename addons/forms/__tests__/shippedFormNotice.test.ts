/**
 * #1918: a shipped form's copy left behind what its add-on ships raises an
 * administrator notice at start, once per form and shipped version — not at
 * every restart, and not again when the notice is dismissed or cleared.
 * `required: true` makes it critical ("Critical:" title, error level, as an
 * add-on that did not load is, #1883); otherwise it is an "update available"
 * info notice. An edited copy behind a change says Sync needs Force Sync.
 *
 * Each test works in its own mkdtemp folder and removes only that folder.
 */

import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import FormsDataManager, { shippedFormNotice } from '../managers/FormsDataManager';
import type { FormDefinition } from '../managers/FormsDataManager';

const V1: FormDefinition = {
  id: 'record-entry',
  title: 'Record an Entry',
  proxySubmission: false,
  notifyRole: 'admin',
  store: true,
  fields: [{ name: 'check', type: 'text', label: 'Check number', required: false }]
};
const V2: FormDefinition = { ...V1, fields: [{ name: 'check', type: 'text', label: 'Reference', required: false }] };
const V3: FormDefinition = { ...V1, fields: [{ name: 'ref', type: 'text', label: 'Reference', required: false }] };

interface Sent { type: string; level: string; title: string; message: string; targetUsers: string[] }

let dir: string;
let sent: Sent[];
let admins: string[];

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'forms-1918-'));
  sent = [];
  admins = ['admin'];
});

afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

/** An engine with the managers the notice asks: who holds admin-system, and where to send. */
function engine(): { getManager: (name: string) => unknown } {
  const managers: Record<string, unknown> = {
    NotificationManager: { createNotification: async (n: Sent) => { sent.push(n); return `n${sent.length}`; } },
    UserManager: { getUsers: async () => [{ username: 'admin' }, { username: 'reader' }] },
    PolicyDecisionPoint: { userHoldsPermission: async (u: string, p: string) => p === 'admin-system' && admins.includes(u) }
  };
  return { getManager: (name: string) => managers[name] };
}

/** A fresh manager over the same folder: what the next start sees. */
async function boot(): Promise<FormsDataManager> {
  const m = new FormsDataManager(engine(), dir);
  await m.initialize();
  return m;
}

async function builderEdit(m: FormsDataManager, title: string): Promise<void> {
  const { shipped: _stamp, ...live } = m.getDefinition('record-entry')!;
  await m.saveDefinition({ ...live, title });
}

describe('registerShippedForm notices a copy left behind (#1918)', () => {
  test('first install and an up-to-date copy raise nothing', async () => {
    await (await boot()).registerShippedForm('accounting', V1);
    await (await boot()).registerShippedForm('accounting', V1, { required: true });
    expect(sent).toEqual([]);
  });

  test('an ordinary change: one info "update available" notice to administrators only, naming add-on, form and Sync', async () => {
    await (await boot()).registerShippedForm('accounting', V1);
    await (await boot()).registerShippedForm('accounting', V2);
    expect(sent).toHaveLength(1);
    const [n] = sent;
    expect(n.level).toBe('info');
    expect(n.type).toBe('system');
    expect(n.title).toBe('Form update available: "Record an Entry" (record-entry) from accounting');
    expect(n.title).not.toMatch(/^Critical:/);
    expect(n.message).toContain('accounting ships a new version of the form "Record an Entry" (record-entry)');
    expect(n.message).toContain('choose Sync');
    expect(n.targetUsers).toEqual(['admin']);
  });

  test('once per form and shipped version: restarts do not raise it again; the next shipped change does', async () => {
    await (await boot()).registerShippedForm('accounting', V1);
    await (await boot()).registerShippedForm('accounting', V2);
    await (await boot()).registerShippedForm('accounting', V2);
    await (await boot()).registerShippedForm('accounting', V2);
    expect(sent).toHaveLength(1);

    await (await boot()).registerShippedForm('accounting', V3);
    expect(sent).toHaveLength(2);
    await (await boot()).registerShippedForm('accounting', V3);
    expect(sent).toHaveLength(2);
  });

  test('required: a critical notice, "Critical:" title at error level, that says the add-on needs it', async () => {
    await (await boot()).registerShippedForm('accounting', V1);
    const state = await (await boot()).registerShippedForm('accounting', V2, { required: true });
    expect(state).toMatchObject({ status: 'outdated', behind: true, required: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].level).toBe('error');
    expect(sent[0].title).toBe('Critical: form "Record an Entry" (record-entry) from accounting needs syncing');
    expect(sent[0].message).toMatch(/^accounting needs this update to work\. /);
    expect(sent[0].message).toContain('choose Sync');
  });

  test('an edited copy behind a required change says Sync will not replace it without Force Sync', async () => {
    const first = await boot();
    await first.registerShippedForm('accounting', V1);
    await builderEdit(first, 'Ours');
    const state = await (await boot()).registerShippedForm('accounting', V2, { required: true });
    expect(state).toMatchObject({ status: 'locally-modified', behind: true, required: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].level).toBe('error');
    expect(sent[0].title).toMatch(/^Critical: /);
    expect(sent[0].message).toContain('It was edited on this site, so Sync does not replace it');
    expect(sent[0].message).toContain('Force Sync');
  });

  test('an edited copy the add-on has not changed is not behind, and raises nothing', async () => {
    const first = await boot();
    await first.registerShippedForm('accounting', V1);
    await builderEdit(first, 'Ours');
    const state = await (await boot()).registerShippedForm('accounting', V1, { required: true });
    expect(state).toMatchObject({ status: 'locally-modified', behind: false });
    expect(sent).toEqual([]);
  });

  test('nobody holds admin-system: log only (never every user), and it is tried again at the next start', async () => {
    await (await boot()).registerShippedForm('accounting', V1);
    admins = [];
    await (await boot()).registerShippedForm('accounting', V2);
    expect(sent).toEqual([]);
    admins = ['admin'];
    await (await boot()).registerShippedForm('accounting', V2);
    expect(sent).toHaveLength(1);
  });

  test('without a notification manager (no engine) registering still works and raises nothing', async () => {
    const plain = new FormsDataManager(null, dir);
    await plain.initialize();
    await plain.registerShippedForm('accounting', V1);
    const again = new FormsDataManager(null, dir);
    await again.initialize();
    expect((await again.registerShippedForm('accounting', V2)).status).toBe('outdated');
  });
});

describe('shippedFormNotice (#1918)', () => {
  const form = { id: 'f', title: 'F' };
  test('ordinary outdated and edited copies are info; required ones are critical', () => {
    expect(shippedFormNotice('a', form, { status: 'outdated', required: false }).level).toBe('info');
    expect(shippedFormNotice('a', form, { status: 'locally-modified', required: false }).level).toBe('info');
    expect(shippedFormNotice('a', form, { status: 'outdated', required: true })).toMatchObject({ level: 'error', title: 'Critical: form "F" (f) from a needs syncing' });
    expect(shippedFormNotice('a', form, { status: 'locally-modified', required: false }).message).toContain('Force Sync');
  });
});
