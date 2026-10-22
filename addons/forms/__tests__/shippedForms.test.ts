/**
 * Forms an add-on provides (#1973). The add-on's form wins: the site's copy
 * is replaced whenever the installed add-on's version is newer than the one
 * that wrote it, left alone at the same version, and kept (with a log line and
 * an administrator notice) when the installed add-on is older. A copy with no
 * `providedBy` (saved before #1973) is replaced at the next start. Such a form
 * is read-only on the site; site-built forms are unaffected.
 *
 * Each test works in its own mkdtemp folder and removes only that folder.
 */

import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import FormsDataManager, { ProvidedFormError } from '../managers/FormsDataManager';
import type { FormDefinition } from '../managers/FormsDataManager';
import { buildAddonHost } from '../../../dist/src/utils/addonHost.js';

/** The add-on's boot context, as `host.systemContext(reason)` makes it. */
const BOOT = { username: 'system', origin: 'boot' as const, requestedAt: new Date().toISOString(), reason: 'test: register forms' };
/** An admin in the form builder. */
const ADMIN = { username: 'admin', roles: ['admin'], isAuthenticated: true };

const V1 = {
  id: 'record-entry',
  title: 'Record an Entry',
  fields: [
    { name: 'direction', type: 'dropdown' as const, label: 'In or out', required: true, options: ['in', 'out'] },
    { name: 'check', type: 'text' as const, label: 'Check number' }
  ]
};
const V2 = { ...V1, store: false, notify: false, fields: [{ name: 'check', type: 'text' as const, label: 'Reference' }] };

interface Sent { type: string; level: string; title: string; message: string; targetUsers: string[] }

let dir: string;
let sent: Sent[];
let versions: Record<string, string>;
/** Core's add-on registry this boot: whether the load pass is over, and which add-ons loaded. */
let loadDone: boolean;
let loaded: Set<string>;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'forms-1973-'));
  sent = [];
  versions = { accounting: '1.0.0', phr: '1.0.0' };
  loadDone = false;
  loaded = new Set(['accounting', 'phr']);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fsp.rm(dir, { recursive: true, force: true });
});

/** An engine with the managers asked: the add-on's version, who holds admin-system, where to send. */
function engine(): { getManager: (name: string) => unknown } {
  const managers: Record<string, unknown> = {
    AddonsManager: {
      getAddonVersion: (slug: string) => versions[slug],
      addonsLoaded: () => loadDone,
      isLoaded: (slug: string) => loaded.has(slug)
    },
    NotificationManager: { createNotification: async (n: Sent) => { sent.push(n); return `n${sent.length}`; } },
    UserManager: { getUsers: async () => [{ username: 'admin' }, { username: 'reader' }] },
    PolicyDecisionPoint: { usersHolding: async (p: string) => (p === 'admin-system' ? ['admin'] : []) }
  };
  return { getManager: (name: string) => managers[name] };
}

/** A fresh manager over the same folder: what the next start sees. */
async function boot(): Promise<FormsDataManager> {
  const e = engine();
  const m = new FormsDataManager(e, dir, buildAddonHost('forms', {}, undefined, e));
  await m.initialize();
  return m;
}

const file = (id: string) => path.join(dir, 'definitions', `${id}.json`);

async function stored(id: string): Promise<FormDefinition> {
  return JSON.parse(await fsp.readFile(file(id), 'utf8')) as FormDefinition;
}

/** A definition file as an earlier release left it on disk. */
async function writeRaw(id: string, body: Record<string, unknown>): Promise<void> {
  await fsp.mkdir(path.join(dir, 'definitions'), { recursive: true });
  await fsp.writeFile(file(id), JSON.stringify(body, null, 2), 'utf8');
}

describe('registerShippedForm (#1973)', () => {
  test('first install writes the form with providedBy: the add-on and its version', async () => {
    expect(await (await boot()).registerShippedForm('accounting', V1, BOOT)).toBe('saved');
    const f = await stored('record-entry');
    expect(f.providedBy).toEqual({ addon: 'accounting', version: '1.0.0' });
    expect(f.fields.map(x => x.label)).toEqual(['In or out', 'Check number']);
    expect(f.notify).toBe(true);
  });

  test('a newer add-on replaces the copy, and its store and notify win', async () => {
    await (await boot()).registerShippedForm('accounting', V1, BOOT);
    versions.accounting = '1.1.0';
    const m = await boot();
    expect(await m.registerShippedForm('accounting', V2, BOOT)).toBe('replaced');
    const f = await stored('record-entry');
    expect(f.providedBy).toEqual({ addon: 'accounting', version: '1.1.0' });
    expect(f.fields.map(x => x.label)).toEqual(['Reference']);
    expect(f.store).toBe(false);
    expect(f.notify).toBe(false);
    expect(m.getDefinition('record-entry')?.notify).toBe(false);
    expect(sent).toEqual([]);
  });

  test('versions compare as numbers: 1.10.0 is newer than 1.9.0', async () => {
    versions.accounting = '1.9.0';
    await (await boot()).registerShippedForm('accounting', V1, BOOT);
    versions.accounting = '1.10.0';
    expect(await (await boot()).registerShippedForm('accounting', V2, BOOT)).toBe('replaced');
  });

  test('the same version writes nothing, even when the definition differs', async () => {
    await (await boot()).registerShippedForm('accounting', V1, BOOT);
    const before = await fsp.stat(file('record-entry'));
    const m = await boot();
    expect(await m.registerShippedForm('accounting', V2, BOOT)).toBe('unchanged');
    expect((await fsp.stat(file('record-entry'))).mtimeMs).toBe(before.mtimeMs);
    expect((await stored('record-entry')).fields).toHaveLength(2);
    expect(sent).toEqual([]);
  });

  test('an older add-on is refused: the copy is kept, logged, and administrators are told both versions', async () => {
    versions.accounting = '2.0.0';
    await (await boot()).registerShippedForm('accounting', V2, BOOT);
    versions.accounting = '1.4.0';
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await (await boot()).registerShippedForm('accounting', V1, BOOT)).toBe('refused');
    const f = await stored('record-entry');
    expect(f.providedBy).toEqual({ addon: 'accounting', version: '2.0.0' });
    expect(f.fields.map(x => x.label)).toEqual(['Reference']);

    expect(logged.mock.calls.some(c => String(c[0]).includes('record-entry') && String(c[0]).includes('1.4.0') && String(c[0]).includes('2.0.0'))).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'system', level: 'warning', targetUsers: ['admin'] });
    expect(sent[0].title).toContain('"Record an Entry" (record-entry)');
    expect(sent[0].title).toContain('accounting 1.4.0 is older than 2.0.0');
    expect(sent[0].message).toContain('Install accounting 2.0.0 or later');
  });

  test('migration: a copy with no providedBy (saved before #1973) is replaced at the next start', async () => {
    // What a #1880 site holds: the old stamp, core-filled defaults, and no `notify` (phr-note on yourPHR).
    await writeRaw('phr-note', {
      id: 'phr-note', title: 'Health note', proxySubmission: false, notifyRole: 'admin', store: false,
      fields: [{ name: 'note', type: 'textarea', label: 'Note', required: true }],
      shipped: { addon: 'phr', sourceHash: 'a'.repeat(64) }
    });
    const m = await boot();
    expect(m.getDefinition('phr-note')?.notify).toBe(true); // the default the bug left in place

    const result = await m.registerShippedForm('phr', {
      id: 'phr-note', title: 'Health note', store: false, notify: false,
      fields: [{ name: 'note', type: 'textarea', label: 'Note', required: true }]
    }, BOOT);
    expect(result).toBe('replaced');
    const f = await stored('phr-note');
    expect(f.notify).toBe(false);
    expect(f.providedBy).toEqual({ addon: 'phr', version: '1.0.0' });
    expect(f).not.toHaveProperty('shipped');
    expect(sent).toEqual([]);
  });

  test('a definition that gains a new core default field (notify) still replaces cleanly', async () => {
    // Written by phr 1.0.0 under a core that had no `notify` key.
    await writeRaw('phr-note', {
      id: 'phr-note', title: 'Health note', proxySubmission: false, notifyRole: 'admin', store: false,
      fields: [{ name: 'note', type: 'textarea', label: 'Note', required: true }],
      providedBy: { addon: 'phr', version: '1.0.0' }
    });
    expect(await (await boot()).registerShippedForm('phr', { id: 'phr-note', title: 'Health note', store: false, fields: [{ name: 'note', type: 'textarea', label: 'Note', required: true }] }, BOOT)).toBe('unchanged');

    versions.phr = '1.0.1';
    const m = await boot();
    expect(await m.registerShippedForm('phr', {
      id: 'phr-note', title: 'Health note', store: false, notify: false,
      fields: [{ name: 'note', type: 'textarea', label: 'Note', required: true }]
    }, BOOT)).toBe('replaced');
    expect((await stored('phr-note')).notify).toBe(false);
    expect(m.getDefinition('phr-note')?.notify).toBe(false);
  });

  test('a stored version that is not x.y.z cannot be compared, so the add-on\'s form wins', async () => {
    await writeRaw('record-entry', { ...V1, providedBy: { addon: 'accounting', version: 'garbage' } });
    expect(await (await boot()).registerShippedForm('accounting', V2, BOOT)).toBe('replaced');
    expect((await stored('record-entry')).providedBy).toEqual({ addon: 'accounting', version: '1.0.0' });
  });

  test('a form another add-on provides is refused and kept', async () => {
    await (await boot()).registerShippedForm('accounting', V1, BOOT);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await (await boot()).registerShippedForm('phr', V2, BOOT)).toBe('refused');
    expect((await stored('record-entry')).providedBy?.addon).toBe('accounting');
  });

  test('an invalid definition, an unknown add-on and a version that is not x.y.z throw at registration', async () => {
    const m = await boot();
    await expect(m.registerShippedForm('accounting', { ...V1, id: 'Bad Id' }, BOOT)).rejects.toThrow();
    await expect(m.registerShippedForm('nobody', V1, BOOT)).rejects.toThrow(/no installed add-on 'nobody'/);
    versions.accounting = '1.0';
    await expect(m.registerShippedForm('accounting', V1, BOOT)).rejects.toThrow(/not x\.y\.z/);
  });

  test('an add-on that passes no context (built before #1973) still registers, with a warning', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const m = await boot();
    expect(await m.registerShippedForm('accounting', V1, { required: true })).toBe('saved');
    expect(warned.mock.calls.some(c => String(c[0]).includes('without a context'))).toBe(true);
  });
});

describe('a form an add-on provides is read-only on the site (#1973)', () => {
  test('saving, renaming over or deleting it is refused at the manager', async () => {
    const m = await boot();
    await m.registerShippedForm('accounting', V1, BOOT);
    const live = m.getDefinition('record-entry')!;
    const { providedBy: _p, ...builderPayload } = live;

    await expect(m.saveDefinition({ ...builderPayload, title: 'Ours' }, ADMIN)).rejects.toThrow(ProvidedFormError);
    await expect(m.deleteDefinition('record-entry', ADMIN)).rejects.toThrow(/provided by accounting 1\.0\.0/);
    // A site form cannot claim providedBy through the builder's door either.
    await expect(m.saveDefinition({ ...builderPayload, id: 'mine', providedBy: { addon: 'accounting', version: '9.9.9' } }, ADMIN)).rejects.toThrow(ProvidedFormError);
    expect((await stored('record-entry')).title).toBe('Record an Entry');
    expect(m.getDefinition('mine')).toBeUndefined();
  });

  test('site-built forms are unaffected: saved, edited and deleted as before, untouched by registration', async () => {
    const m = await boot();
    const site: FormDefinition = { id: 'site-made', title: 'Ours', proxySubmission: false, notifyRole: 'admin', store: true, notify: true, fields: [{ name: 'a', type: 'text', label: 'A', required: false }] };
    await m.saveDefinition(site, ADMIN);
    await m.registerShippedForm('accounting', V1, BOOT);
    versions.accounting = '1.1.0';
    await (await boot()).registerShippedForm('accounting', V2, BOOT);

    const again = await boot();
    expect(again.getDefinition('site-made')).toEqual(site);
    expect((await stored('site-made'))).not.toHaveProperty('providedBy');
    await again.saveDefinition({ ...site, title: 'Ours, edited' }, ADMIN);
    expect((await stored('site-made')).title).toBe('Ours, edited');
    expect(await again.deleteDefinition('site-made', ADMIN)).toBe(true);
  });
});

describe('a form its add-on no longer provides may be deleted (#1973)', () => {
  const OTHER = { id: 'other-entry', title: 'Other', fields: [{ name: 'a', type: 'text' as const, label: 'A' }] };

  test('its add-on is not loaded this boot: orphaned once loading is over, and deleted; submissions are kept', async () => {
    await (await boot()).registerShippedForm('accounting', V1, BOOT);
    const m = await boot();
    await m.saveSubmission({ formId: 'record-entry', submittedAt: new Date().toISOString(), submittedBy: 'u', data: {}, status: 'pending' });
    loaded.delete('accounting');
    loadDone = true;

    expect(m.orphanedFrom('record-entry')).toBe('accounting');
    await expect(m.saveDefinition({ ...m.getDefinition('record-entry')!, providedBy: undefined, title: 'Ours' }, ADMIN)).rejects.toThrow(ProvidedFormError);
    expect(await m.deleteDefinition('record-entry', ADMIN)).toBe(true);
    expect(m.getDefinition('record-entry')).toBeUndefined();
    await expect(fsp.access(file('record-entry'))).rejects.toThrow();
    expect(await m.getSubmissionCount('record-entry')).toBe(1);
  });

  test('its add-on loaded but no longer registers it: orphaned; the forms it still registers are not', async () => {
    const first = await boot();
    await first.registerShippedForm('accounting', V1, BOOT);
    await first.registerShippedForm('accounting', OTHER, BOOT);
    versions.accounting = '1.1.0';
    const m = await boot();
    await m.registerShippedForm('accounting', OTHER, BOOT);
    loadDone = true;

    expect(m.orphanedFrom('record-entry')).toBe('accounting');
    expect(m.orphanedFrom('other-entry')).toBeUndefined();
    await expect(m.deleteDefinition('other-entry', ADMIN)).rejects.toThrow(ProvidedFormError);
    expect(await m.deleteDefinition('record-entry', ADMIN)).toBe(true);
  });

  test('a form its add-on still provides is refused after loading, as before', async () => {
    const m = await boot();
    await m.registerShippedForm('accounting', V1, BOOT);
    loadDone = true;
    expect(m.orphanedFrom('record-entry')).toBeUndefined();
    await expect(m.deleteDefinition('record-entry', ADMIN)).rejects.toThrow(/provided by accounting 1\.0\.0/);
    expect(m.getDefinition('record-entry')).toBeDefined();
  });

  test('nothing is orphaned before loading is over, even a form no add-on has registered yet', async () => {
    await (await boot()).registerShippedForm('accounting', V1, BOOT);
    const m = await boot();
    loaded.delete('accounting');
    expect(m.orphanedFrom('record-entry')).toBeUndefined();
    await expect(m.deleteDefinition('record-entry', ADMIN)).rejects.toThrow(ProvidedFormError);
    expect(await stored('record-entry')).toMatchObject({ providedBy: { addon: 'accounting' } });
  });

  test('an add-on that ships the form again after it was deleted gets it written again', async () => {
    await (await boot()).registerShippedForm('accounting', V1, BOOT);
    const m = await boot();
    loaded.delete('accounting');
    loadDone = true;
    expect(await m.deleteDefinition('record-entry', ADMIN)).toBe(true);

    loaded.add('accounting');
    loadDone = false;
    const next = await boot();
    expect(await next.registerShippedForm('accounting', V1, BOOT)).toBe('saved');
    loadDone = true;
    expect(next.orphanedFrom('record-entry')).toBeUndefined();
    expect((await stored('record-entry')).providedBy).toEqual({ addon: 'accounting', version: '1.0.0' });
  });

  test('a site-built form is never orphaned', async () => {
    const m = await boot();
    loadDone = true;
    await m.saveDefinition({ id: 'site-made', title: 'Ours', proxySubmission: false, notifyRole: 'admin', store: true, notify: true, fields: [{ name: 'a', type: 'text', label: 'A', required: false }] }, ADMIN);
    expect(m.orphanedFrom('site-made')).toBeUndefined();
  });
});
