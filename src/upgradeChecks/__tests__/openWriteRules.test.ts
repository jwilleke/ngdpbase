/** The rules-that-let-many-people-write to-do (#2313): worked out from the current policies, allows only. */
import UpgradeCheckManager from '../../managers/UpgradeCheckManager';
import { shippedLiveChecks } from '../index';
import { ruleSentence, RULES_URL } from '../openWriteRules';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergeConfigWithAddons, mergeWithAddonLayer } from '../../utils/addonConfigLayer';
import { admin, cleanup, makeFixture, type Fixture } from '../../test-support/upgradeChecks';

describe('open write rules (#2313)', () => {
  let f: Fixture;
  let manager: UpgradeCheckManager;
  const rules = () => f.props['ngdpbase.access.policies'] as unknown[];
  const texts = async () => (await manager.openItems(admin)).map((i) => i.text);
  beforeEach(() => {
    f = makeFixture();
    manager = new UpgradeCheckManager(f.engine);
    shippedLiveChecks(f.engine).forEach((c) => manager.registerLive(c));
  });
  afterEach(() => cleanup(f));

  test('rules that stay within the shipped bounds show nothing', async () => {
    rules().push(
      { id: 'read-all', effect: 'allow', subjects: [{ type: 'anyone' }], actions: ['page-read'], resources: [{ type: 'page', pattern: '*' }] },
      { id: 'admin-pages', effect: 'allow', subjects: [{ type: 'role', value: 'admin' }], actions: ['page-edit'], resources: [{ type: 'page', pattern: '*' }] },
      { id: 'editors', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], actions: ['page-edit'], resources: [{ type: 'system-category', pattern: 'general' }] }
    );
    expect(await texts()).toEqual([]);
  });

  test('signed-out visitors, every signed-in user, and another role each get a plain sentence', async () => {
    rules().push(
      { id: 'open-edit', effect: 'allow', subjects: [{ type: 'anyone' }], actions: ['page-read', 'page-edit'], resources: [{ type: 'system-category', pattern: 'general' }] },
      { id: 'members', effect: 'allow', subjects: [{ type: 'authenticated' }], actions: ['page-edit', 'page-delete'], resources: [{ type: 'page', pattern: '*' }] },
      { id: 'writers', effect: 'allow', subjects: [{ type: 'role', value: 'writer' }], actions: ['page-rename'], resources: [{ type: 'page', pattern: 'Notes*' }] }
    );
    expect(await texts()).toEqual([
      'The rule \'open-edit\' lets signed-out visitors edit pages in General.',
      'The rule \'members\' lets every signed-in user edit and delete every page.',
      'The rule \'writers\' lets people with the role \'writer\' rename pages named \'Notes*\'.'
    ]);
    const [first] = await manager.openItems(admin);
    expect(first.link).toEqual({ label: 'Change this rule', href: RULES_URL });
    expect(RULES_URL).toBe('/admin/configuration#config-ngdpbase.access.policies');
  });

  test('no actions listed means everything', async () => {
    rules().push({ id: 'wide', effect: 'allow', subjects: [{ type: 'anyone' }], resources: [{ type: 'page', pattern: '*' }] });
    expect(await texts()).toEqual(['The rule \'wide\' lets signed-out visitors do anything with every page.']);
  });

  test('deny rules are not in it', async () => {
    rules().push({ id: 'no-edit', effect: 'deny', subjects: [{ type: 'anyone' }], actions: ['page-edit'], resources: [{ type: 'page', pattern: '*' }] });
    expect(await texts()).toEqual([]);
  });

  test('it follows the policies as they change, with no restart: gone once the rule is changed or removed', async () => {
    rules().push({ id: 'open-edit', effect: 'allow', subjects: [{ type: 'anyone' }], actions: ['page-edit'], resources: [{ type: 'system-category', pattern: 'general' }] });
    expect(await texts()).toHaveLength(1);
    (rules()[rules().length - 1] as { actions: string[] }).actions = ['page-read'];
    expect(await texts()).toEqual([]);
    rules().pop();
    expect(await texts()).toEqual([]);
  });

  test('shipped non-page actions and vault / shared-folder types read in plain words', () => {
    const say = (actions: string[], type: string, pattern = '*') => ruleSentence({ id: 'x', who: { kind: 'authenticated' }, actions, resources: [{ type, pattern }] });
    expect(say(['asset-read', 'comment-create'], 'vault')).toBe("The rule 'x' lets every signed-in user see and comment on vaults.");
    expect(say(['shared-folder-file'], 'shared-folder')).toBe("The rule 'x' lets every signed-in user add files to shared folders.");
    expect(say(['vault-proxy'], 'vault', 'Mine')).toBe("The rule 'x' lets every signed-in user act for the owner of vaults named 'Mine'.");
    expect(say(['made-up-action'], 'vault')).not.toMatch(/made-up|use '/);
    for (const text of [say(['asset-upload', 'search-page'], 'shared-folder'), say(['vault-proxy'], 'vault')]) expect(text.replace('signed-in', '')).not.toMatch(/[a-z]+-[a-z]+|items/);
  });

  test('the shipped calendar rules, add-on included, are not listed: calendar-read is a read', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const shipped = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-write-calendar-'));
    try {
      const { merged } = mergeConfigWithAddons({ ...shipped, 'ngdpbase.addons.calendar.enabled': true }, {}, repoRoot, dir);
      const policies = merged['ngdpbase.access.policies'] as Array<{ id: string }>;
      expect(policies.some((p) => p.id === 'calendar-read-access')).toBe(true);
      f.props['ngdpbase.permissions.definitions'] = merged['ngdpbase.permissions.definitions'];
      f.props['ngdpbase.access.policies'] = policies;
      expect((await texts()).filter((t) => t.includes('calendar-read-access'))).toEqual([]);
      // The same rule with a page write is still listed.
      policies.push({ id: 'members-edit', effect: 'allow', subjects: [{ type: 'authenticated' }], actions: ['page-edit'], resources: [{ type: 'page', pattern: '*' }] } as never);
      expect(await texts()).toEqual(["The rule 'members-edit' lets every signed-in user edit every page."]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an add-on that marks a core permission read-only does not hide a rule that grants it', async () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const shipped = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
    const evil = { slug: 'evil', dir: '', enabled: true, defaults: { 'ngdpbase.permissions.definitions': { 'page-edit': { 'read-only': true }, '*': { 'read-only': true } } } };
    const { merged } = mergeWithAddonLayer(shipped, [evil], {});
    f.props['ngdpbase.permissions.definitions'] = merged['ngdpbase.permissions.definitions'];
    f.props['ngdpbase.access.policies'] = [
      { id: 'members-edit', effect: 'allow', subjects: [{ type: 'authenticated' }], actions: ['page-edit'], resources: [{ type: 'page', pattern: '*' }] },
      { id: 'members-all', effect: 'allow', subjects: [{ type: 'authenticated' }], resources: [{ type: 'page', pattern: '*' }] }
    ];
    expect(await texts()).toEqual([
      "The rule 'members-edit' lets every signed-in user edit every page.",
      "The rule 'members-all' lets every signed-in user do anything with every page."
    ]);
  });

  test('an add-on that marks a permission the site defined in its own file does not hide a rule that grants it', async () => {
    const custom = { 'ngdpbase.permissions.definitions': { 'wiki-publish': { description: 'Publish' } } };
    const evil = { slug: 'evil', dir: '', enabled: true, defaults: { 'ngdpbase.permissions.definitions': { 'wiki-publish': { 'read-only': true } } } };
    const { merged, refused } = mergeWithAddonLayer({ 'ngdpbase.permissions.definitions': {} }, [evil], custom);
    expect(refused.has('evil')).toBe(true);
    f.props['ngdpbase.permissions.definitions'] = merged['ngdpbase.permissions.definitions'];
    f.props['ngdpbase.access.policies'] = [{ id: 'members-publish', effect: 'allow', subjects: [{ type: 'authenticated' }], actions: ['wiki-publish'], resources: [{ type: 'page', pattern: '*' }] }];
    expect(await texts()).toHaveLength(1);
  });

  test("the wildcard marked read-only in a site's own file still lists a rule with no actions", async () => {
    f.props['ngdpbase.permissions.definitions'] = { '*': { 'read-only': true } };
    f.props['ngdpbase.access.policies'] = [{ id: 'wide', effect: 'allow', subjects: [{ type: 'anyone' }], resources: [{ type: 'page', pattern: '*' }] }];
    expect(await texts()).toEqual(["The rule 'wide' lets signed-out visitors do anything with every page."]);
  });

  test('the sentence names no issue number, file or setting', () => {
    const s = ruleSentence({ id: 'x', who: { kind: 'anyone' }, actions: ['page-edit'], resources: [{ type: 'system-category', pattern: 'general' }] });
    expect(s).not.toMatch(/#\d+|docs\/|ngdpbase\./);
  });
});
