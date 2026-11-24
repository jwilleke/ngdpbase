/**
 * #2509 (review of #2511, L1 and L3): the upgrade clean-up's question "does
 * the page's author hold the admin permission" answered by the real
 * PolicyDecisionPoint, PolicyInformationPoint and RoleManager, with the
 * shipped policies. Only the stores under them are stand-ins: which account is
 * active, which roles a person holds, and whether the role store answers.
 */
vi.unmock('../PageManager');

import { readFileSync } from 'fs';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import PolicyEvaluator from '../PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import { roleManagerOver } from './__fixtures__/roleManagerOver';
import { formatPrivatePageName } from '../../utils/privateStorePath';
import { readSignInDone } from '../../utils/upgradeLeftovers';
import logger from '../../utils/logger';

type Meta = Record<string, unknown>;
interface Result { converted: number; left: number }
interface Subject { username: string; roles: string[]; isAuthenticated: boolean }
interface TestManager {
  provider: unknown;
  getPage: (name: string) => Promise<unknown>;
  savePage: (name: string, content: string, meta: Meta, ctx: unknown) => Promise<unknown>;
  convertLegacyAccessAtBoot(): Promise<Result>;
  convertLegacyAccessOnSignIn(subject: Subject): Promise<Result>;
}

const shipped = JSON.parse(readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
const ID: Record<string, string> = {
  root: 'urn:uuid:11111111-1111-4111-8111-111111111111',
  bob: 'urn:uuid:22222222-2222-4222-8222-222222222222',
  gone: 'urn:uuid:33333333-3333-4333-8333-333333333333'
};
const NAME_OF = Object.fromEntries(Object.entries(ID).map(([n, id]) => [id, n]));
const ROOT: Subject = { username: 'root', roles: ['admin'], isAuthenticated: true };

describe('the upgrade clean-up asks the real permission check about a page author (#2509)', () => {
  let folder: string;
  let pageMeta: Meta[];
  let files: string[];
  /** Who holds which role in the role store. */
  let roleStore: Record<string, string[]>;
  /** The accounts as stored; `isActive: false` is a closed account. */
  let accounts: Record<string, Meta>;
  let roleStoreDown: boolean;
  let saved: Meta[];

  beforeEach(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-legacy-access-decider-'));
    pageMeta = [];
    files = [];
    saved = [];
    roleStoreDown = false;
    roleStore = { root: ['admin'], bob: ['editor'], gone: ['admin'] };
    accounts = { root: { username: 'root', isActive: true }, bob: { username: 'bob', isActive: true }, gone: { username: 'gone', isActive: false } };
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(folder);
  });

  async function add(title: string, metadata: Meta): Promise<string> {
    const uuid = `u${pageMeta.length + 1}`;
    const filePath = path.join(folder, `${uuid}.md`);
    await fs.writeFile(filePath, `---\ntitle: ${title}\nuuid: ${uuid}\n---\nbody\n`);
    files.push(filePath);
    pageMeta.push({ title, uuid, 'system-category': 'general', ...metadata });
    return title;
  }

  async function manager(): Promise<TestManager> {
    const props: Record<string, unknown> = { ...shipped, 'ngdpbase.system.principal': 'svc' };
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
        getUnresolvedProperty: (k: string, d: unknown) => (k in props ? props[k] : d),
        getCustomProperty: () => undefined,
        getInstanceDataFolder: () => folder
      }
    };
    const engine = { getManager: (n: string) => managers[n] ?? null };
    const evaluator = new PolicyEvaluator(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
    managers.PolicyInformationPoint = new PolicyInformationPoint(engine);
    await evaluator.initialize();
    // The role store is the real RoleManager's, over a stand-in for where memberships are kept.
    managers.RoleManager = roleManagerOver(engine, {
      listByMember: vi.fn(async (id: string) => {
        if (roleStoreDown) throw new Error('role store down');
        return (roleStore[NAME_OF[id]] ?? []).map((namedPosition) => ({ namedPosition }));
      })
    });
    managers.IdentityManager = {
      canAnswer: () => true,
      usernameOf: async (_c: unknown, s: string) => NAME_OF[s] ?? s,
      storedReferenceOf: async (_c: unknown, n: string) => ID[n] ?? n,
      getByUserIdentifier: async (_c: unknown, u: string) => (accounts[u] ? { '@id': ID[u] } : null)
    };
    managers.UserManager = { getUser: async (u: string) => accounts[u] };
    const m = new PageManager(engine) as unknown as TestManager;
    m.provider = {
      getAllPageInfo: vi.fn(async () => pageMeta.map((metadata, i) => ({ title: String(metadata.title), uuid: String(metadata.uuid), filePath: files[i], metadata: { ...metadata } })))
    };
    // The page's own read and save go through the door, which is not what is asked here.
    m.getPage = async (name: string) => {
      const meta = pageMeta.find((p) => p.title === name);
      return meta ? { name, title: name, uuid: meta.uuid, metadata: { ...meta }, content: 'body' } : null;
    };
    m.savePage = async (name: string, _c: string, meta: Meta) => {
      saved.push(meta);
      const i = pageMeta.findIndex((p) => p.title === name);
      if (i >= 0) pageMeta[i] = { ...meta };
      return { name, uuid: String(meta.uuid) };
    };
    return m;
  }

  describe('real PolicyDecisionPoint and RoleManager', () => {
    test('an administrator author, by the role store, with a user record that carries no roles', async () => {
      await add('Board Notes', { access: { edit: ['admin'] }, author: ID.root });
      const m = await manager();
      expect(await m.convertLegacyAccessAtBoot()).toEqual({ converted: 1, left: 0 });
      expect(saved[0]['author-lock']).toBe(true);
    });

    test('an author who holds no admin permission is not converted', async () => {
      await add('Bobs Notes', { access: { edit: ['admin'] }, author: ID.bob });
      const m = await manager();
      expect(await m.convertLegacyAccessAtBoot()).toEqual({ converted: 0, left: 1 });
      expect(saved).toEqual([]);
    });

    test('an inactive account that still holds the admin role in the role store is not an administrator', async () => {
      await add('Old Board Notes', { access: { edit: ['admin'] }, author: ID.gone });
      const m = await manager();
      expect(await m.convertLegacyAccessAtBoot()).toEqual({ converted: 0, left: 1 });
      expect(saved).toEqual([]);
    });

    test('an author with no account at all is not an administrator', async () => {
      await add('Ghost Notes', { access: { edit: ['admin'] }, author: 'nobody' });
      const m = await manager();
      expect(await m.convertLegacyAccessAtBoot()).toEqual({ converted: 0, left: 1 });
    });
  });

  describe('a role store that cannot answer is not a "no"', () => {
    test('at sign-in the person is not recorded done, and the next sign-in converts the page', async () => {
      await add('Secret Notes', { access: { edit: ['admin'] }, author: ID.root, private: true });
      const m = await manager();
      const warn = vi.spyOn(logger, 'warn').mockImplementation((() => logger) as never);
      roleStoreDown = true;
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 1 });
      expect(saved).toEqual([]);
      // Not final: the record of who is done does not hold them.
      expect(readSignInDone(folder)?.has('root') ?? false).toBe(false);
      expect(warn).toHaveBeenCalled();
      roleStoreDown = false;
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
      expect(saved[0]['author-lock']).toBe(true);
    });

    test('a vault page by its owner, an administrator: the same, and the log does not name the page', async () => {
      const vault = formatPrivatePageName('root', 'notes', 'Secret Plans');
      await add(vault, { access: { edit: ['admin'] }, author: ID.root });
      const m = await manager();
      const lines: string[] = [];
      for (const level of ['info', 'warn'] as const) vi.spyOn(logger, level).mockImplementation(((...a: unknown[]) => { lines.push(a.map(String).join(' ')); return logger; }) as never);
      roleStoreDown = true;
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 0, left: 1 });
      roleStoreDown = false;
      expect(await m.convertLegacyAccessOnSignIn(ROOT)).toEqual({ converted: 1, left: 0 });
      expect(lines.join('\n')).not.toContain('Secret Plans');
    });
  });
});
