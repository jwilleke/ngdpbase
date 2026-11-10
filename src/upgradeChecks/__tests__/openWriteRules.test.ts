/** The rules-that-let-many-people-write to-do (#2313): worked out from the current policies, allows only. */
import UpgradeCheckManager from '../../managers/UpgradeCheckManager';
import { shippedLiveChecks } from '../index';
import { ruleSentence, RULES_URL } from '../openWriteRules';
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

  test('the sentence names no issue number, file or setting', () => {
    const s = ruleSentence({ id: 'x', who: { kind: 'anyone' }, actions: ['page-edit'], resources: [{ type: 'system-category', pattern: 'general' }] });
    expect(s).not.toMatch(/#\d+|docs\/|ngdpbase\./);
  });
});
