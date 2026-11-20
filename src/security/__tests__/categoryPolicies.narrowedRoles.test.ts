/**
 * A site that narrowed a shipped role policy before the page-write policies moved to the categories (#2255)
 * keeps what it narrowed (#2270). Real ConfigurationManager on the shipped configuration with the site's
 * stored policy list, then the real policy stack, so what is asserted is what a person is let do.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import ConfigurationManager from '../../managers/ConfigurationManager';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyValidator from '../../managers/PolicyValidator';
import UpgradeCheckManager from '../../managers/UpgradeCheckManager';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyInformationPoint from '../PolicyInformationPoint';
import { shippedLiveChecks } from '../../upgradeChecks/index';
import logger from '../../utils/logger';
import type { ActorContext } from '../../context/ActorContext';
import type { Policy } from '../../types/Policy';

const SHIPPED_PATH = path.join(__dirname, '../../../config/app-default-config.json');
const shipped = fs.readJsonSync(SHIPPED_PATH) as Record<string, unknown>;
const shippedPolicies = shipped['ngdpbase.access.policies'] as Policy[];
const KEY = 'ngdpbase.access.policies';
const NARROWED_KEY = 'ngdpbase.access.narrowed-role-writes';
const WRITES = ['page-edit', 'page-delete', 'page-rename'];

/** A role policy as a site saved it before #2255: the shipped one with its page writes on every page. */
const shippedPolicy = (id: string): Policy => {
  const policy = shippedPolicies.find((p) => p.id === id);
  if (!policy) throw new Error(`${id} is not shipped`);
  return policy;
};
const savedBefore = (id: string, writes: string[], without: string[] = []): Policy => {
  const policy = shippedPolicy(id);
  return { ...policy, actions: [...(policy.actions ?? []), ...writes.filter((w) => !without.includes(w))] };
};

const user = (username: string, roles: string[]) => ({ username, roles, isAuthenticated: true });
const editor = user('erin', ['editor', 'vault-owner']);
const contributor = user('carl', ['contributor', 'vault-owner']);
const demoAdmin = user('dee', ['demo-admin', 'vault-owner']);
const admin = user('ada', ['admin', 'vault-owner']);
const meta = (category: string, author = 'system') => ({ title: 'P', uuid: 'u1', lastModified: '', 'system-category': category, author });
const ctx = { username: 'ada', roles: ['admin'], isAuthenticated: true } as unknown as ActorContext;

describe('a narrowed role policy stays narrowed after the category policies arrive (#2270)', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cm: ConfigurationManager;
  let pip: PolicyInformationPoint;
  let upgrades: UpgradeCheckManager;
  let validator: PolicyValidator;

  const customFile = () => path.join(tempDir, 'data', 'config', 'app-custom-config.json');

  /** Boot with the site's stored list (or none), and the policy stack on top of that configuration. */
  async function boot(stored?: Policy[]): Promise<void> {
    await fs.ensureDir(path.join(tempDir, 'data', 'config'));
    await fs.writeJson(customFile(), stored ? { [KEY]: stored } : {});
    await start();
  }

  /** A restart: the file as the last save left it. */
  const restart = (): Promise<void> => start();

  async function start(): Promise<void> {
    cm = new ConfigurationManager({ getManager: vi.fn() });
    await cm.initialize();
    const managers: Record<string, unknown> = {
      ConfigurationManager: cm,
      ValidationManager: { getDefaultSystemCategory: () => 'general' },
      AuditManager: { logAuditEvent: () => Promise.resolve() },
      ShareManager: { isEncryptedVault: () => Promise.resolve(false) },
      PageManager: { checkPrivatePageAccess: async () => null }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const evaluator = new PolicyEvaluator(engine);
    const pdp = new PolicyDecisionPoint(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = pdp;
    await evaluator.initialize();
    pip = new PolicyInformationPoint(engine);
    await pip.initialize();
    managers.PolicyInformationPoint = pip;
    validator = new PolicyValidator(engine);
    await validator.initialize();
    managers.PolicyValidator = validator;
    upgrades = new UpgradeCheckManager(engine);
    shippedLiveChecks(engine).forEach((c) => upgrades.registerLive(c));
  }

  const may = (subject: unknown, action: string, pageMetadata: unknown) =>
    pip.checkPagePermissionWithContext({ pageName: 'P', userContext: subject, pageMetadata }, action);
  const items = async () => (await upgrades.openItems(ctx)).map((i) => i.text);
  const warnings = () => (logger.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'narrowed-roles-'));
    await fs.ensureDir(path.join(tempDir, 'config'));
    await fs.copy(SHIPPED_PATH, path.join(tempDir, 'config', 'app-default-config.json'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    delete process.env.INSTANCE_DATA_FOLDER;
    delete process.env.FAST_STORAGE;
    delete process.env.SLOW_STORAGE;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('editor-permissions stored without page-delete and page-rename', () => {
    const narrowedEditor = () => [savedBefore('editor-permissions', WRITES, ['page-delete', 'page-rename'])];

    test('an editor edits a general page but cannot delete or rename it', async () => {
      await boot(narrowedEditor());
      expect(await may(editor, 'edit', meta('general'))).toBe(true);
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      expect(await may(editor, 'rename', meta('general'))).toBe(false);
    });

    test('nor can an editor delete or rename a page of their own in a self-managed category', async () => {
      await boot(narrowedEditor());
      expect(await may(editor, 'edit', meta('capture', 'erin'))).toBe(true);
      expect(await may(editor, 'delete', meta('capture', 'erin'))).toBe(false);
      expect(await may(editor, 'rename', meta('user-profile', 'erin'))).toBe(false);
    });

    test('an administrator, who the site did not narrow, still changes every page', async () => {
      await boot(narrowedEditor());
      for (const action of ['edit', 'delete', 'rename']) {
        expect(await may(admin, action, meta('general'))).toBe(true);
        expect(await may(admin, action, meta('capture', 'erin'))).toBe(true);
      }
    });

    test('the other roles are unchanged', async () => {
      await boot(narrowedEditor());
      expect(await may(contributor, 'edit', meta('general'))).toBe(true);
      expect(await may(demoAdmin, 'edit', meta('general'))).toBe(true);
    });

    test('the site\'s file is not rewritten', async () => {
      const stored = narrowedEditor();
      await boot(stored);
      expect(await fs.readJson(customFile())).toEqual({ [KEY]: stored });
    });

    test('the start-up log says what was kept and why', async () => {
      await boot(narrowedEditor());
      const lines = warnings().filter((l) => l.includes('editor-permissions'));
      expect(lines.some((l) => l.includes('page-delete') && l.includes('page-rename') && l.includes('general-page-write'))).toBe(true);
    });

    test('Admin shows one plain item, read live, with nothing technical in it', async () => {
      await boot(narrowedEditor());
      const shown = await items();
      expect(shown).toHaveLength(1);
      expect(shown[0]).toContain('Editors');
      expect(shown[0]).toMatch(/delete/);
      expect(shown[0]).toMatch(/rename/);
      expect(shown[0]).not.toMatch(/page-delete|#\d+|docs\/|ngdpbase\.|log/);
    });

    test('saving the policy list in Admin → Configuration keeps it, and the item is gone', async () => {
      await boot(narrowedEditor());
      await cm.setProperty(KEY, cm.getProperty(KEY) as Policy[], ctx);
      expect(await items()).toEqual([]);
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      await restart();
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      expect(await may(editor, 'edit', meta('general'))).toBe(true);
      expect(await items()).toEqual([]);
    });
  });

  describe('contributor-permissions stored without page-edit, demo-admin-access stored with it', () => {
    test('a contributor cannot edit a general page or their own capture page; a demo administrator still can', async () => {
      await boot([savedBefore('contributor-permissions', ['page-edit'], ['page-edit']), savedBefore('demo-admin-access', ['page-edit'])]);
      expect(await may(contributor, 'edit', meta('general'))).toBe(false);
      expect(await may(contributor, 'edit', meta('capture', 'carl'))).toBe(false);
      expect(await may(demoAdmin, 'edit', meta('general'))).toBe(true);
      expect(await may(demoAdmin, 'edit', meta('capture', 'dee'))).toBe(true);
      const shown = await items();
      expect(shown).toHaveLength(1);
      expect(shown[0]).toContain('Contributors');
    });
  });

  describe('a site that narrowed nothing', () => {
    const before = [
      savedBefore('editor-permissions', WRITES),
      savedBefore('contributor-permissions', ['page-edit']),
      savedBefore('demo-admin-access', ['page-edit'])
    ];

    test('full copies of the old role policies decide as the shipped policies do, and nothing is reported', async () => {
      await boot(before);
      for (const action of ['edit', 'delete', 'rename']) {
        expect(await may(editor, action, meta('general'))).toBe(true);
        expect(await may(editor, action, meta('capture', 'erin'))).toBe(true);
      }
      expect(await may(contributor, 'edit', meta('general'))).toBe(true);
      expect(await may(contributor, 'delete', meta('general'))).toBe(false);
      expect(await may(demoAdmin, 'edit', meta('general'))).toBe(true);
      expect(await items()).toEqual([]);
      expect(cm.narrowedRoleWrites).toEqual([]);
    });

    test('no stored policies at all: the shipped ones, nothing reported', async () => {
      await boot();
      for (const action of ['edit', 'delete', 'rename']) expect(await may(editor, action, meta('general'))).toBe(true);
      expect(await items()).toEqual([]);
    });
  });

  describe('every writer of the custom file, then a restart (#2270 review)', () => {
    const own = (id: string): Policy => ({ id, name: id, effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'shared-folder', pattern: 'docs' }], actions: ['shared-folder-read'] });
    /** What each shipped writer hands `setProperty`: the site's own list as `getCustomProperty` returns it, plus its entry. */
    const writers: Array<[string, () => Promise<void>]> = [
      ['another setting', () => cm.setProperty('ngdpbase.application-name', 'Other', ctx)],
      ['the Shared folders screen', () => cm.setProperty(KEY, [...(cm.getCustomProperty(KEY) as Policy[]), own('shared-folder-docs-read')], ctx)],
      ['the "Let administrators edit these pages" button', () => cm.setProperty(KEY, [...(cm.getCustomProperty(KEY) as Policy[]), own('administrators-change-uneditable-pages')], ctx)],
      ['the Admin editor', () => cm.setProperty(KEY, cm.getProperty(KEY) as Policy[], ctx)]
    ];
    const everything = async (who: Array<[unknown, string, boolean]>) => {
      for (const [subject, action, expected] of who) expect(`${(subject as { username: string }).username} ${action} ${await may(subject, action, meta('general'))}`).toBe(`${(subject as { username: string }).username} ${action} ${expected}`);
    };

    describe.each(writers)('a site that narrowed nothing, saved by %s', (_name, write) => {
      const full = () => [savedBefore('admin-full-access', WRITES), savedBefore('editor-permissions', WRITES), savedBefore('contributor-permissions', ['page-edit']), savedBefore('demo-admin-access', ['page-edit'])];
      const unchanged: Array<[unknown, string, boolean]> = [[editor, 'edit', true], [editor, 'delete', true], [editor, 'rename', true], [contributor, 'edit', true], [demoAdmin, 'edit', true]];

      test('nobody loses a write, now or after a restart, and nothing is reported', async () => {
        await boot(full());
        await write();
        await everything(unchanged);
        expect(await items()).toEqual([]);
        await restart();
        await everything(unchanged);
        expect(await may(editor, 'delete', meta('capture', 'erin'))).toBe(true);
        expect(await items()).toEqual([]);
        expect(cm.narrowedRoleWrites).toEqual([]);
      });
    });

    describe.each(writers)('a site that narrowed the editor and the contributor, saved by %s', (_name, write) => {
      const narrowed = () => [savedBefore('admin-full-access', WRITES), savedBefore('editor-permissions', WRITES, ['page-delete', 'page-rename']), savedBefore('contributor-permissions', ['page-edit'], ['page-edit']), savedBefore('demo-admin-access', ['page-edit'])];
      const kept: Array<[unknown, string, boolean]> = [[editor, 'edit', true], [editor, 'delete', false], [editor, 'rename', false], [contributor, 'edit', false], [demoAdmin, 'edit', true], [admin, 'delete', true]];

      test('they stay narrowed, now and after a restart, and the note is gone once the file holds it', async () => {
        await boot(narrowed());
        await write();
        await everything(kept);
        expect(await items()).toEqual([]);
        await restart();
        await everything(kept);
        expect(await may(editor, 'delete', meta('capture', 'erin'))).toBe(false);
        expect(await items()).toEqual([]);
      });
    });

    test('a policy nothing is left of stays gone after a save and a restart: contributors and demo administrators both narrowed', async () => {
      await boot([savedBefore('editor-permissions', WRITES), savedBefore('contributor-permissions', ['page-edit'], ['page-edit']), savedBefore('demo-admin-access', ['page-edit'], ['page-edit'])]);
      const gone: Array<[unknown, string, boolean]> = [[contributor, 'edit', false], [demoAdmin, 'edit', false], [editor, 'edit', true], [editor, 'delete', true]];
      await everything(gone);
      await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
      await restart();
      await everything(gone);
      expect(await items()).toEqual([]);
    });

    test('a list another writer saved on 5.43 to 5.45 (copies with no writes, no category policies, nothing that shows it was narrowed) is not read as narrowed: editors keep their writes', async () => {
      await boot([shippedPolicy('editor-permissions'), shippedPolicy('contributor-permissions'), shippedPolicy('demo-admin-access')]);
      for (const action of ['edit', 'delete', 'rename']) expect(await may(editor, action, meta('general'))).toBe(true);
      expect(await may(contributor, 'edit', meta('general'))).toBe(true);
      expect(await items()).toEqual([]);
    });

    test('a file the site narrowed and nothing has saved since is read again at every start', async () => {
      await boot([savedBefore('admin-full-access', WRITES), savedBefore('editor-permissions', WRITES, ['page-delete'])]);
      await restart();
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      expect(await items()).toHaveLength(1);
    });

    test('a hand-edited policy that is not a list of rules does not stop a save, and what is in force is what was saved', async () => {
      await boot([savedBefore('admin-full-access', WRITES), savedBefore('editor-permissions', WRITES, ['page-delete'])]);
      const odd = { id: 'editor-permissions', effect: 'allow', resources: 'page', subjects: 'editor', actions: 'page-read' } as unknown as Policy;
      await expect(cm.setProperty(KEY, [odd, ...(cm.getCustomProperty(KEY) as Policy[])], ctx)).resolves.toBeUndefined();
      expect((await fs.readJson(customFile()))[KEY]).toEqual(cm.getCustomProperty(KEY));
    });

    test('a rule the site already has under the name a split would take does not leave two with one name', async () => {
      const taken: Policy = { id: 'general-page-write-editor', name: 'mine', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-read'] };
      await boot([savedBefore('admin-full-access', WRITES), savedBefore('editor-permissions', WRITES, ['page-delete', 'page-rename']), taken]);
      const ids = (cm.getProperty(KEY) as Policy[]).map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
    });

    test('two copies of one rule in the file: the one the merge keeps is the one read', async () => {
      await boot([savedBefore('editor-permissions', WRITES), savedBefore('editor-permissions', WRITES, ['page-delete', 'page-rename'])]);
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      expect(await items()).toHaveLength(1);
    });

    test('resetting the policy list does not end the narrowing; clearing the record does, at once and after a restart', async () => {
      await boot([savedBefore('admin-full-access', WRITES), savedBefore('editor-permissions', WRITES, ['page-delete'])]);
      await cm.setProperty(KEY, undefined, ctx);
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      await cm.setProperty(NARROWED_KEY, undefined, ctx);
      expect(await may(editor, 'delete', meta('general'))).toBe(true);
      await restart();
      expect(await may(editor, 'delete', meta('general'))).toBe(true);
      expect(await items()).toEqual([]);
    });
  });

  describe('the narrowing is recorded in its own setting, not in the policy list (#2270 re-review)', () => {
    const narrowedEditor = () => [savedBefore('admin-full-access', WRITES), savedBefore('editor-permissions', WRITES, ['page-delete', 'page-rename'])];
    const nothingLeft = () => [savedBefore('editor-permissions', WRITES), savedBefore('contributor-permissions', ['page-edit'], ['page-edit']), savedBefore('demo-admin-access', ['page-edit'], ['page-edit'])];
    const problems = () => [...validator.policyProblems(cm.getProperty(KEY)), ...validator.policyProblems(cm.getCustomProperty(KEY) ?? [])];
    const ids = (list: unknown) => (list as Policy[]).map((p) => p.id);

    test('a site that narrowed everything a policy gave still has a list the validator accepts, in force and stored, after a save and a restart', async () => {
      await boot(nothingLeft());
      await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
      await restart();
      expect(problems()).toEqual([]);
      expect(JSON.stringify(await fs.readJson(customFile()))).not.toContain('"none"');
      expect(await may(contributor, 'edit', meta('general'))).toBe(false);
      expect(await may(demoAdmin, 'edit', meta('general'))).toBe(false);
    });

    test('the file records the narrowing as role and write pairs, and its policy list holds no category policy', async () => {
      await boot(narrowedEditor());
      await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
      const file = await fs.readJson(customFile());
      expect(file[NARROWED_KEY]).toEqual([{ role: 'editor', action: 'page-delete' }, { role: 'editor', action: 'page-rename' }]);
      expect(ids(file[KEY]).filter((id) => /^(general|self-managed|shared|pushed)-/.test(id))).toEqual([]);
    });

    test('a site that narrowed nothing has no record', async () => {
      await boot([savedBefore('admin-full-access', WRITES), savedBefore('editor-permissions', WRITES)]);
      await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
      expect((await fs.readJson(customFile()))[NARROWED_KEY]).toBeUndefined();
    });

    test('removing the narrowed category rules in a policy-list save, then a restart, does not give the write back', async () => {
      await boot(narrowedEditor());
      await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
      await restart();
      const without = (cm.getProperty(KEY) as Policy[]).filter((p) => !/^(general-page-write|self-managed-author-write)/.test(p.id));
      await cm.setProperty(KEY, without, ctx);
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      await restart();
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      expect(await may(editor, 'delete', meta('capture', 'erin'))).toBe(false);
      expect(await may(editor, 'edit', meta('general'))).toBe(true);
    });

    test('a category policy a later release adds, which grants editors delete, is narrowed too', async () => {
      await boot(narrowedEditor());
      await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
      const later: Policy = { ...shippedPolicy('general-page-write'), id: 'later-general-delete', subjects: [{ type: 'role', value: 'editor' }], actions: ['page-delete'] };
      const file = path.join(tempDir, 'config', 'app-default-config.json');
      const defaults = await fs.readJson(file);
      defaults[KEY] = [...(defaults[KEY] as Policy[]), later];
      await fs.writeJson(file, defaults);
      await restart();
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      expect(await may(editor, 'edit', meta('general'))).toBe(true);
    });

    test('an administrator who clears the pairs gets the writes back at once and after a restart', async () => {
      await boot(narrowedEditor());
      await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
      await cm.setProperty(NARROWED_KEY, [], ctx);
      expect(await may(editor, 'delete', meta('general'))).toBe(true);
      await restart();
      expect(await may(editor, 'delete', meta('general'))).toBe(true);
    });

    test('a hand-edited record that is not a list of role and write pairs is read as empty and stops nothing', async () => {
      await boot(narrowedEditor());
      await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
      const file = await fs.readJson(customFile());
      file[NARROWED_KEY] = [{ role: 'editor', action: 'page-read' }, { role: 'nobody', action: 'page-delete' }, 'editor', null, { role: 'editor' }];
      await fs.writeJson(customFile(), file);
      await restart();
      expect(await may(editor, 'edit', meta('general'))).toBe(true);
      expect(problems()).toEqual([]);
    });
  });

  describe('the stored list holds only the site\'s own changes, and the pairs are the one way back (#2270 re-review)', () => {
    const narrowedEditor = () => [savedBefore('admin-full-access', WRITES), savedBefore('editor-permissions', WRITES, ['page-delete', 'page-rename'])];
    const problems = () => [...validator.policyProblems(cm.getProperty(KEY)), ...validator.policyProblems(cm.getCustomProperty(KEY) ?? [])];
    const ids = (list: unknown) => (list as Policy[]).map((p) => p.id);
    /** What Admin → Configuration does with the policy row: shows the list in force and saves it back as the site's own. */
    const adminSavesTheListInForce = () => cm.setProperty(KEY, cm.getProperty(KEY), ctx);
    const everyWrite = async (allowed: boolean) => {
      for (const action of ['delete', 'rename']) {
        expect(await may(editor, action, meta('general')), `${action} on a general page`).toBe(allowed);
        expect(await may(editor, action, meta('capture', 'erin')), `${action} on their own capture page`).toBe(allowed);
        expect(await may(editor, action, meta('user-profile', 'erin')), `${action} on their own profile page`).toBe(allowed);
      }
    };

    test('saving the list in force from Admin stores none of the narrowing: no split rule, and the category rules still name editors', async () => {
      await boot(narrowedEditor());
      await adminSavesTheListInForce();
      const stored = (await fs.readJson(customFile()))[KEY] as Policy[];
      expect(ids(stored).filter((id) => /-editor(-\d+)?$/.test(id))).toEqual([]);
      const write = stored.find((p) => p.id === 'general-page-write');
      expect(JSON.stringify(write?.subjects)).toContain('editor');
      expect(problems()).toEqual([]);
      await everyWrite(false);
      await restart();
      await everyWrite(false);
    });

    test('after an Admin save of the list in force, clearing the pairs gives back every narrowed write, on general, capture and profile pages, at once and after a restart', async () => {
      await boot(narrowedEditor());
      await adminSavesTheListInForce();
      await cm.setProperty(NARROWED_KEY, [], ctx);
      await everyWrite(true);
      expect(problems()).toEqual([]);
      await restart();
      await everyWrite(true);
      expect(problems()).toEqual([]);
      expect(await items()).toEqual([]);
    });

    test('the same after a restart between the Admin save and the clearing', async () => {
      await boot(narrowedEditor());
      await adminSavesTheListInForce();
      await restart();
      await adminSavesTheListInForce();
      await restart();
      await cm.setProperty(NARROWED_KEY, [], ctx);
      await everyWrite(true);
      await restart();
      await everyWrite(true);
    });

    test('taking out one of two pairs gives back that write only, after an Admin save', async () => {
      await boot(narrowedEditor());
      await adminSavesTheListInForce();
      await cm.setProperty(NARROWED_KEY, [{ role: 'editor', action: 'page-rename' }], ctx);
      expect(await may(editor, 'delete', meta('general'))).toBe(true);
      expect(await may(editor, 'delete', meta('capture', 'erin'))).toBe(true);
      expect(await may(editor, 'rename', meta('general'))).toBe(false);
      expect(await may(editor, 'rename', meta('capture', 'erin'))).toBe(false);
      await restart();
      expect(await may(editor, 'delete', meta('capture', 'erin'))).toBe(true);
      expect(await may(editor, 'rename', meta('capture', 'erin'))).toBe(false);
    });

    test('a rule the site adds on top of the list in force is kept in the file', async () => {
      await boot(narrowedEditor());
      const mine: Policy = { id: 'mine', name: 'mine', effect: 'allow', subjects: [{ type: 'role', value: 'contributor' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-read'] };
      await cm.setProperty(KEY, [...(cm.getProperty(KEY) as Policy[]), mine], ctx);
      expect(ids((await fs.readJson(customFile()))[KEY])).toContain('mine');
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
    });

    test('renaming the General write rule in the list in force keeps page-edit for editors, now and after a restart, and clearing the pairs gives delete back', async () => {
      await boot(narrowedEditor());
      const shown = (cm.getProperty(KEY) as Policy[]).map((p) => (p.id === 'general-page-write' ? { ...p, name: 'General writes, renamed' } : p));
      await cm.setProperty(KEY, shown, ctx);
      const storedList = (await fs.readJson(customFile()))[KEY] as Policy[];
      expect(storedList.find((p) => p.id === 'general-page-write')?.name).toBe('General writes, renamed');
      expect(ids(storedList).filter((id) => /-editor(-\d+)?$/.test(id))).toEqual([]);
      expect(await may(editor, 'edit', meta('general'))).toBe(true);
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      await restart();
      expect(await may(editor, 'edit', meta('general'))).toBe(true);
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
      await cm.setProperty(NARROWED_KEY, [], ctx);
      await everyWrite(true);
      expect(await may(editor, 'edit', meta('general'))).toBe(true);
      expect(problems()).toEqual([]);
    });

    test('deleting the editor piece from the list in force, with the pairs still there, does not bring editors a write the site removed', async () => {
      await boot(narrowedEditor());
      const shown = (cm.getProperty(KEY) as Policy[]).filter((p) => p.id !== 'general-page-write-editor');
      await cm.setProperty(KEY, shown, ctx);
      expect(await may(editor, 'delete', meta('general'))).toBe(false);
    });

    test('a rule id with a line break in it cannot forge a log line', async () => {
      const mine: Policy = { id: 'my-delete\nWARN forged line', name: 'mine', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-delete'] };
      await boot([...narrowedEditor(), mine]);
      const lines = warnings().filter((w) => w.includes('my-delete'));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line).not.toMatch(/[\r\n]/);
    });

    describe('a rule of the site\'s own that grants a narrowed write', () => {
      const mine: Policy = { id: 'my-editors-delete', name: 'my editors delete', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-delete'] };

      test('is still left out, is logged by name at every start, and has a note in Admin in plain words', async () => {
        await boot(narrowedEditor());
        await cm.setProperty(KEY, [...(cm.getProperty(KEY) as Policy[]), mine], ctx);
        expect(await may(editor, 'delete', meta('general'))).toBe(false);
        vi.clearAllMocks();
        await restart();
        expect(await may(editor, 'delete', meta('general'))).toBe(false);
        expect(warnings().filter((w) => w.includes("'my-editors-delete'"))).toHaveLength(1);
        const text = (await items()).join('\n');
        expect(text).toContain("'my-editors-delete'");
        expect(text).toMatch(/Editors/);
        expect(text).toMatch(/delete/);
        expect(text).not.toMatch(/#\d/);
      });

      test('is not deleted from the file when Admin saves the list in force', async () => {
        await boot(narrowedEditor());
        await cm.setProperty(KEY, [...(cm.getProperty(KEY) as Policy[]), mine], ctx);
        await adminSavesTheListInForce();
        expect(ids((await fs.readJson(customFile()))[KEY])).toContain('my-editors-delete');
        await cm.setProperty(NARROWED_KEY, [], ctx);
        expect(await may(editor, 'delete', meta('general'))).toBe(true);
      });

      test('says nothing when the site narrowed nothing', async () => {
        await boot([savedBefore('admin-full-access', WRITES), savedBefore('editor-permissions', WRITES), mine]);
        await restart();
        expect(warnings().filter((w) => w.includes("'my-editors-delete'"))).toEqual([]);
        expect(await items()).toEqual([]);
      });
    });

    describe('a record that cannot be read', () => {
      const bad = [{ role: 'editor', action: 'page-delete' }, { role: 'Editor', action: 'page-rename' }, 'x', null];
      const withRecord = async (record: unknown) => {
        await boot(narrowedEditor());
        await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
        const file = await fs.readJson(customFile());
        file[NARROWED_KEY] = record;
        await fs.writeJson(customFile(), file);
        vi.clearAllMocks();
        await restart();
      };

      test('is logged once for each entry it skips, and the entries it can read still apply', async () => {
        await withRecord(bad);
        const mine = warnings().filter((w) => w.includes(NARROWED_KEY));
        expect(mine).toHaveLength(3);
        expect(mine.join('\n')).toMatch(/entry 2.*'Editor'/);
        expect(await may(editor, 'delete', meta('general'))).toBe(false);
        expect(await may(editor, 'rename', meta('general'))).toBe(true);
      });

      test('raises a note in Admin in plain words that says the entry is ignored and what to do', async () => {
        await withRecord(bad);
        const text = (await items()).join('\n');
        expect(text).toMatch(/could not be read/);
        expect(text).toMatch(/ignored/);
        expect(text).toMatch(/Admin → Configuration/);
        expect(text).not.toMatch(/#\d/);
      });

      test.each([
        ['a string', 'editor:page-delete'],
        ['an object', {}],
        ['a misspelt write', [{ role: 'editor', action: 'page-delet' }]]
      ])('%s is logged and noted, not silently read as empty', async (_name, record) => {
        await withRecord(record);
        expect(warnings().filter((w) => w.includes(NARROWED_KEY)).length).toBeGreaterThan(0);
        expect((await items()).join('\n')).toMatch(/could not be read/);
      });

      test('a good record says nothing', async () => {
        await boot(narrowedEditor());
        await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
        vi.clearAllMocks();
        await restart();
        expect(warnings().filter((w) => w.includes(NARROWED_KEY))).toEqual([]);
        expect(await items()).toEqual([]);
      });
    });

    test('Reset to defaults clears the pairs and the shipped rules apply again, live and after a restart', async () => {
      await boot(narrowedEditor());
      await cm.setProperty('ngdpbase.application-name', 'Other', ctx);
      await cm.resetToDefaults(ctx);
      expect(await fs.readJson(customFile())).not.toHaveProperty([NARROWED_KEY]);
      await everyWrite(true);
      await restart();
      await everyWrite(true);
    });
  });

  test('a list saved since the category policies shipped is not read as narrowed: its role policies hold no page writes by design', async () => {
    await boot([
      shippedPolicy('editor-permissions'),
      ...shippedPolicies.filter((p) => ['general-page-write', 'general-page-edit'].includes(p.id))
    ]);
    for (const action of ['edit', 'delete', 'rename']) expect(await may(editor, action, meta('general'))).toBe(true);
    expect(await items()).toEqual([]);
  });
});
