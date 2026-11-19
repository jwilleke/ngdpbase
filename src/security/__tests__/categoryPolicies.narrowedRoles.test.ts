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

  const customFile = () => path.join(tempDir, 'data', 'config', 'app-custom-config.json');

  /** Boot with the site's stored list (or none), and the policy stack on top of that configuration. */
  async function boot(stored?: Policy[]): Promise<void> {
    await fs.ensureDir(path.join(tempDir, 'data', 'config'));
    await fs.writeJson(customFile(), stored ? { [KEY]: stored } : {});
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
      await boot((await fs.readJson(customFile()))[KEY] as Policy[]);
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

  test('a list saved since the category policies shipped is not read as narrowed: its role policies hold no page writes by design', async () => {
    await boot([
      shippedPolicy('editor-permissions'),
      ...shippedPolicies.filter((p) => ['general-page-write', 'general-page-edit'].includes(p.id))
    ]);
    for (const action of ['edit', 'delete', 'rename']) expect(await may(editor, action, meta('general'))).toBe(true);
    expect(await items()).toEqual([]);
  });
});
