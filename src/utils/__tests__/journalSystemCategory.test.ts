/**
 * #1507 — the journal's system-category and vault are declared by the journal
 * add-on, in addons/journal/config/default-config.json, not by core config.
 * Core reads the entry live from the add-on whether it is on or off (#1559).
 *
 * Reads the real shipped config and the real bundled add-ons, so moving the
 * entry back into core (or dropping it from the add-on) goes red here.
 */
vi.unmock('../../managers/AddonsManager');

import fs from 'fs';
import path from 'path';
import ValidationManager from '../../managers/ValidationManager';
import { mergeConfigWithAddons } from '../addonConfigLayer';
import { storeKindFromConfig } from '../privateStoreDoor';
import type { WikiEngine } from '../../types/WikiEngine';

const SC = 'ngdpbase.system-category';
const ROOT = process.cwd();
const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'app-default-config.json'), 'utf8')) as Record<string, unknown>;
const journalDefaults = JSON.parse(fs.readFileSync(path.join(ROOT, 'addons', 'journal', 'config', 'default-config.json'), 'utf8')) as Record<string, unknown>;

/** The entry core shipped before #1507; the move changes none of it but `owner`. */
const BEFORE_1507 = {
  label: 'journal',
  description: 'Personal journal entries — schema.org BlogPosting at JSON-LD render time (#791)',
  default: false,
  source: 'site',
  enabled: true,
  storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/journal/' },
  defaultPrivate: 'choice',
  encrypt: false,
  shareMaxDays: 15,
  'page-badge': { color: 'bg-info', label: 'Journal', title: 'Journal entry' }
};

function journalOf(merged: Record<string, unknown>): Record<string, unknown> | undefined {
  return (merged[SC] as Record<string, Record<string, unknown>>).journal;
}

function validationManagerFor(merged: Record<string, unknown>): Promise<ValidationManager> {
  const configManager = { getProperty: (key: string, def: unknown) => merged[key] ?? def };
  const engine = {
    getManager: (name: string) => (name === 'ConfigurationManager' ? configManager : undefined),
    blockConfiguration: () => undefined
  } as unknown as WikiEngine;
  const vm = new ValidationManager(engine);
  return vm.initialize().then(() => vm);
}

describe('#1507 the journal declares its own system-category', () => {
  test('core config no longer carries it', () => {
    expect((shipped[SC] as Record<string, unknown>).journal).toBeUndefined();
  });

  test('the journal add-on declares it, owner journal, with the values core shipped before', () => {
    const entry = (journalDefaults[SC] as Record<string, unknown>).journal;
    expect(entry).toEqual({ ...BEFORE_1507, owner: 'journal' });
  });
});

describe('#1507 the journal category resolves from the add-on', () => {
  test('turned off: readable, owned by journal, same vault, not offered', async () => {
    const { merged, problems, refused } = mergeConfigWithAddons(shipped, { 'ngdpbase.addons.journal.enabled': false }, ROOT);
    expect(problems).toEqual([]);
    expect(refused.size).toBe(0);
    expect(journalOf(merged)).toEqual({ ...BEFORE_1507, owner: 'journal', enabled: false });

    const vm = await validationManagerFor(merged);
    expect(vm.getCategoryConfig('journal')).toMatchObject({ key: 'journal', owner: 'journal' });
    expect(vm.getVaultId('journal')).toBe('journal');
    expect(vm.getAllSystemCategories().map((c) => c.label)).not.toContain('journal');
    expect(storeKindFromConfig((key, def) => merged[key] ?? def, 'journal')).toEqual({ id: 'journal', owner: 'journal', encrypt: false });
  });

  test('turned on: offered, with the same label, vault and privacy as before', async () => {
    const { merged, problems } = mergeConfigWithAddons(shipped, { 'ngdpbase.addons.journal.enabled': true }, ROOT);
    expect(problems).toEqual([]);
    expect(journalOf(merged)).toEqual({ ...BEFORE_1507, owner: 'journal' });

    const vm = await validationManagerFor(merged);
    expect(vm.getAllSystemCategories().map((c) => c.label)).toContain('journal');
    expect(vm.getVaultId('journal')).toBe('journal');
    expect(vm.getShareMaxDays('journal')).toBe(15);
    expect(vm.getDefaultPrivate('journal', {})).toBe(true);
    expect(vm.getDefaultPrivate('journal', { 'journal.defaultPrivate': false })).toBe(false);
  });

  test('a site override of encrypt or defaultPrivate is ignored, with a warning', () => {
    const custom = {
      'ngdpbase.addons.journal.enabled': true,
      [SC]: { journal: { encrypt: true, defaultPrivate: true, description: 'Our diary' } }
    };
    const { merged, problems } = mergeConfigWithAddons(shipped, custom, ROOT);
    expect(journalOf(merged)).toMatchObject({ encrypt: false, defaultPrivate: 'choice', description: 'Our diary', owner: 'journal' });
    expect(problems).toEqual([
      expect.stringMatching(/journal\.encrypt.*owner 'journal'.*ignored/),
      expect.stringMatching(/journal\.defaultPrivate.*owner 'journal'.*ignored/)
    ]);
  });
});
