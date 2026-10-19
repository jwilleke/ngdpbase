/**
 * Shipped form definitions (#1880): an add-on registers a form it ships; the
 * site's copy is saved on first install, shown as outdated when the add-on
 * ships a change, synced only when unedited, and replaced over site edits
 * only on an explicit overwrite. A copy saved before #1880 has no stamp.
 *
 * Each test works in its own mkdtemp folder and removes only that folder.
 */

import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import FormsDataManager from '../managers/FormsDataManager';
import type { FormDefinition } from '../managers/FormsDataManager';

const V1: FormDefinition = {
  id: 'record-entry',
  title: 'Record an Entry',
  proxySubmission: false,
  notifyRole: 'admin',
  store: true,
  fields: [
    { name: 'direction', type: 'dropdown', label: 'In or out', required: true, options: ['in', 'out'] },
    { name: 'check', type: 'text', label: 'Check number', required: false }
  ]
};

const V2: FormDefinition = {
  ...V1,
  fields: [{ name: 'check', type: 'text', label: 'Reference', required: false }]
};

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'forms-1880-'));
});

afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

/** A fresh manager over the same folder: what the next start sees. */
async function boot(): Promise<FormsDataManager> {
  const m = new FormsDataManager(null, dir);
  await m.initialize();
  return m;
}

async function stored(id: string): Promise<FormDefinition> {
  return JSON.parse(await fsp.readFile(path.join(dir, 'definitions', `${id}.json`), 'utf8')) as FormDefinition;
}

/** An edit in the form builder: the builder's payload never carries the stamp. */
async function builderEdit(m: FormsDataManager, title: string): Promise<void> {
  const { shipped: _stamp, ...live } = m.getDefinition('record-entry')!;
  await m.saveDefinition({ ...live, title });
}

describe('registerShippedForm (#1880)', () => {
  test('first install saves the shipped definition, stamped, and it is current', async () => {
    const m = await boot();
    const state = await m.registerShippedForm('accounting', V1);
    expect(state).toEqual({ addon: 'accounting', status: 'current', stamped: true, shippedChanged: false });
    const file = await stored('record-entry');
    expect(file.fields.map(f => f.label)).toEqual(['In or out', 'Check number']);
    expect(file.shipped?.addon).toBe('accounting');
    expect(file.shipped?.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('an upgrade that changes the form shows the unedited copy as outdated, and does not overwrite it', async () => {
    await (await boot()).registerShippedForm('accounting', V1);
    const m = await boot();
    const state = await m.registerShippedForm('accounting', V2);
    expect(state.status).toBe('outdated');
    expect(state.stamped).toBe(true);
    expect(m.getDefinition('record-entry')?.fields).toHaveLength(2);
  });

  test('sync updates an unedited outdated copy to what the add-on ships now', async () => {
    await (await boot()).registerShippedForm('accounting', V1);
    const m = await boot();
    await m.registerShippedForm('accounting', V2);
    expect(await m.syncShippedForm('record-entry')).toBe('synced');
    expect((await stored('record-entry')).fields.map(f => f.label)).toEqual(['Reference']);
    expect(m.shippedFormState('record-entry')?.status).toBe('current');
    // and the next start agrees
    expect((await (await boot()).registerShippedForm('accounting', V2)).status).toBe('current');
  });

  test('a copy edited in the form builder is protected: it shows as edited and sync refuses it', async () => {
    const first = await boot();
    await first.registerShippedForm('accounting', V1);
    await builderEdit(first, 'Record an Entry (ours)');
    expect((await stored('record-entry')).shipped?.addon).toBe('accounting'); // the edit kept the stamp

    const m = await boot();
    const state = await m.registerShippedForm('accounting', V2);
    expect(state.status).toBe('locally-modified');
    expect(await m.syncShippedForm('record-entry')).toBe('edited');
    expect((await stored('record-entry')).title).toBe('Record an Entry (ours)');
  });

  test('an edited copy is replaced only on an explicit overwrite', async () => {
    const first = await boot();
    await first.registerShippedForm('accounting', V1);
    await builderEdit(first, 'Record an Entry (ours)');
    const m = await boot();
    await m.registerShippedForm('accounting', V2);

    expect(await m.syncShippedForm('record-entry', { overwriteEdited: true })).toBe('synced');
    const file = await stored('record-entry');
    expect(file.title).toBe('Record an Entry');
    expect(file.fields.map(f => f.label)).toEqual(['Reference']);
    expect(m.shippedFormState('record-entry')?.status).toBe('current');
  });

  test('an edited copy that the add-on has not changed is left alone and is not offered as an update', async () => {
    const first = await boot();
    await first.registerShippedForm('accounting', V1);
    await builderEdit(first, 'Ours');
    const state = await (await boot()).registerShippedForm('accounting', V1);
    expect(state.status).toBe('locally-modified');
    expect(state.shippedChanged).toBe(false);
    expect((await stored('record-entry')).title).toBe('Ours');
  });

  describe('a copy saved before #1880 (no stamp)', () => {
    test('that says the same as the shipped form is stamped, and an edit after that is protected', async () => {
      await (await boot()).saveDefinition(V1); // the old "save if missing"
      expect((await stored('record-entry')).shipped).toBeUndefined();

      const m = await boot();
      expect(await m.registerShippedForm('accounting', V1)).toEqual({ addon: 'accounting', status: 'current', stamped: true, shippedChanged: false });
      expect((await stored('record-entry')).shipped?.addon).toBe('accounting');

      await builderEdit(m, 'Ours');
      expect((await (await boot()).registerShippedForm('accounting', V2)).status).toBe('locally-modified');
    });

    test('that differs is outdated, unstamped, left as it is at start, and Sync replaces it', async () => {
      await (await boot()).saveDefinition(V1);
      const m = await boot();
      const state = await m.registerShippedForm('accounting', V2);
      expect(state).toEqual({ addon: 'accounting', status: 'outdated', stamped: false, shippedChanged: true });
      expect((await stored('record-entry')).shipped).toBeUndefined();
      expect((await stored('record-entry')).fields).toHaveLength(2);

      expect(await m.syncShippedForm('record-entry')).toBe('synced');
      expect((await stored('record-entry')).fields.map(f => f.label)).toEqual(['Reference']);
      expect(m.shippedFormState('record-entry')).toEqual({ addon: 'accounting', status: 'current', stamped: true, shippedChanged: false });
    });
  });

  test('defaults and key order do not read as a change', async () => {
    const m = await boot();
    await m.registerShippedForm('accounting', V1);
    // The add-on's object without the defaults the schema fills, keys reordered.
    const sparse = {
      fields: V1.fields.map(({ required, ...f }) => (required ? { required, ...f } : f)),
      title: V1.title,
      id: V1.id
    } as unknown as FormDefinition;
    expect((await (await boot()).registerShippedForm('accounting', sparse)).status).toBe('current');
  });

  test('a form no add-on registered has no shipped state, and sync says so', async () => {
    const m = await boot();
    await m.saveDefinition({ ...V1, id: 'site-made' });
    expect(m.shippedFormState('site-made')).toBeUndefined();
    expect(await m.syncShippedForm('site-made')).toBe('not-shipped');
  });

  test('an invalid shipped definition throws at registration', async () => {
    const m = await boot();
    await expect(m.registerShippedForm('accounting', { ...V1, id: 'Bad Id' })).rejects.toThrow();
  });
});
