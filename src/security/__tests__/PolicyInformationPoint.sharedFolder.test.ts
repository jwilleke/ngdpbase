/**
 * Shared folders are opened by permission, never by role or owner (#2125,
 * epic #1775, docs/planning/shared-folders.md "Access is by permission").
 *
 * Run against the SHIPPED policies, a real PolicyEvaluator, a real
 * PolicyDecisionPoint and a real PolicyInformationPoint:
 * - `/shared/default` is open to every signed-in user (vault-owner, the role
 *   every account is given) and to nobody signed out;
 * - any other folder opens only through a policy naming `shared/<name>`, and
 *   reading is not filing;
 * - an admin reads every folder (`shared-folder-admin-read`, operator
 *   2026-10-29) but files into none a policy does not name; an admin's
 *   site-wide page grants and the vault-owner policy add nothing more;
 * - a grant removed ends access on the next request: a new request's subject
 *   holds no folder key until the PDP permits it again;
 * - a share link never gets in, and no share action is allowed in a folder.
 *
 * Sabotaged once each (then restored):
 * - the shared-folder branch in walkPageTiers (removed): the default-folder
 *   and "a policy naming the folder" tests went red;
 * - the `viaShare` refusal in permitsInSharedFolder (removed): the share test
 *   went red on its permit-everything PDP (the real PDP's share ceiling
 *   refuses too, so the refusal is asked before any PDP);
 * - the `shared-folder` resource matcher (returning true): "a folder no policy
 *   names", "a policy naming the folder" and "does not leak" went red;
 * - the shipped `shared-folder-admin-read` policy (removed): "an admin reads
 *   every folder" went red.
 */

import fs from 'fs';
import path from 'path';
import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import { formatPrivatePageName, SHARED_FOLDER_OWNER } from '../../utils/privateStorePath';
import { permitsInVault } from '../../utils/privateStoreAccess';
import { openedFor, permitsInSharedFolder, setSharedFolderKeySource, sharedFolderKeyFor } from '../../utils/sharedFolderAccess';
import { dekFor } from '../../utils/privateStoreUnlock';
import type { ActorContext } from '../../context/ActorContext';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
const shippedPolicies = shipped['ngdpbase.access.policies'] as Array<Record<string, unknown>>;

const MINUTES = formatPrivatePageName(SHARED_FOLDER_OWNER, 'default', 'Minutes');
const BOARD = formatPrivatePageName(SHARED_FOLDER_OWNER, 'executive', 'Board pack');
const meta = (title: string) => ({ title, uuid: `u-${title}`, lastModified: '', 'system-category': 'general' });

const user = (username: string, roles: string[]): ActorContext => ({ username, roles, isAuthenticated: true }) as never;
const anonymous = (): ActorContext => ({ username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false }) as never;

/** A policy the admin screen (slice 3) would write: `executive` reads and files into shared/executive. */
const executivePolicy = {
  id: 'shared-folder-executive-test',
  name: 'Executive folder (test)',
  priority: 60,
  effect: 'allow',
  subjects: [{ type: 'role', value: 'executive' }],
  resources: [{ type: 'shared-folder', pattern: 'shared/executive' }],
  actions: ['shared-folder-read', 'shared-folder-file']
};
/** Reading without filing: `board-observer` reads shared/executive. */
const observerPolicy = { ...executivePolicy, id: 'shared-folder-observer-test', subjects: [{ type: 'role', value: 'board-observer' }], actions: ['shared-folder-read'] };

describe('shared folders answer to permission alone (#2125)', () => {
  let pip: PolicyInformationPoint;
  let pdp: PolicyDecisionPoint;
  let policies: Array<Record<string, unknown>>;

  beforeEach(async () => {
    policies = [...shippedPolicies, executivePolicy, observerPolicy];
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (key: string, def: unknown) => (key === 'ngdpbase.access.policies' ? policies : key in shipped ? shipped[key] : def)
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const evaluator = new PolicyEvaluator(engine);
    pdp = new PolicyDecisionPoint(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = pdp;
    await evaluator.initialize();
    pip = new PolicyInformationPoint(engine);
    await pip.initialize();
    managers.PolicyInformationPoint = pip;
  });

  afterEach(() => setSharedFolderKeySource(null));

  const decide = (userContext: unknown, action: string, pageName: string) =>
    pip.checkPagePermissionWithContext({ pageName, userContext, pageMetadata: meta(pageName) }, action);

  test('/shared/default is open to every signed-in user, to read and to file, and closed signed out', async () => {
    const reader = user('rita', ['reader', 'vault-owner']);
    for (const action of ['view', 'edit', 'delete']) expect(await decide(reader, action, MINUTES)).toBe(true);
    for (const action of ['view', 'edit']) expect(await decide(anonymous(), action, MINUTES)).toBe(false);
  });

  test('a folder no policy names opens to no ordinary account, not even vault-owner', async () => {
    const reader = user('rita', ['reader', 'editor', 'vault-owner']);
    for (const action of ['view', 'edit', 'delete']) expect(await decide(reader, action, BOARD)).toBe(false);
    expect(await permitsInSharedFolder(pdp, reader, 'page-read', 'executive')).toBe(false);
    expect(await permitsInSharedFolder(pdp, reader, 'asset-read', 'executive')).toBe(false);
  });

  test('an admin reads every folder, and files into none a policy does not name', async () => {
    const admin = user('ann', ['admin', 'vault-owner']);
    for (const action of ['view', 'history', 'diff']) expect(await decide(admin, action, BOARD)).toBe(true);
    for (const action of ['edit', 'delete', 'rename']) expect(await decide(admin, action, BOARD)).toBe(false);
    expect(await permitsInSharedFolder(pdp, admin, 'page-read', 'executive')).toBe(true);
    expect(await permitsInSharedFolder(pdp, admin, 'shared-folder-read', 'executive')).toBe(true);
    expect(await permitsInSharedFolder(pdp, admin, 'shared-folder-file', 'executive')).toBe(false);
    expect(await permitsInVault(pdp as never, admin, 'asset-read', { owner: SHARED_FOLDER_OWNER, vault: 'executive', resource: BOARD })).toBe(true);
    for (const action of ['page-create', 'asset-upload', 'asset-delete']) {
      expect(await permitsInVault(pdp as never, admin, action, { owner: SHARED_FOLDER_OWNER, vault: 'executive', resource: BOARD })).toBe(false);
    }
    // Without the shipped policy an admin is shut out like anyone else.
    policies = policies.filter((p) => p.id !== 'shared-folder-admin-read');
    expect(await permitsInSharedFolder(pdp, user('ann', ['admin', 'vault-owner']), 'page-read', 'executive')).toBe(false);
  });

  test('a policy naming the folder opens it; reading is not filing', async () => {
    const exec = user('eve', ['reader', 'vault-owner', 'executive']);
    expect(await decide(exec, 'view', BOARD)).toBe(true);
    expect(await decide(exec, 'edit', BOARD)).toBe(true);
    const observer = user('olly', ['reader', 'vault-owner', 'board-observer']);
    expect(await decide(observer, 'view', BOARD)).toBe(true);
    expect(await decide(observer, 'edit', BOARD)).toBe(false);
    expect(await decide(observer, 'delete', BOARD)).toBe(false);
    // The page door's capability question asks the same: file to create.
    expect(await permitsInVault(pdp as never, observer, 'page-create', { owner: SHARED_FOLDER_OWNER, vault: 'executive', resource: BOARD })).toBe(false);
    expect(await permitsInVault(pdp as never, exec, 'page-create', { owner: SHARED_FOLDER_OWNER, vault: 'executive', resource: BOARD })).toBe(true);
    expect(await permitsInVault(pdp as never, exec, 'asset-upload', { owner: SHARED_FOLDER_OWNER, vault: 'executive', resource: BOARD })).toBe(true);
    expect(await permitsInVault(pdp as never, observer, 'asset-read', { owner: SHARED_FOLDER_OWNER, vault: 'executive', resource: BOARD })).toBe(true);
  });

  test('a folder grant does not leak: no capability check and no public page gains from it', async () => {
    const exec = user('eve', ['reader', 'executive']);
    expect(await pdp.permits(exec, 'shared-folder-read')).toBe(false);
    expect(await pdp.permits(exec, 'shared-folder-file')).toBe(false);
    const admin = user('ann', ['admin', 'vault-owner']);
    expect(await pdp.permits(admin, 'shared-folder-read')).toBe(false);
    expect(await pdp.permits(admin, 'shared-folder-file')).toBe(false);
  });

  test('a grant removed ends access on the next request; the key goes only to a context the PDP permitted', async () => {
    const key = Buffer.alloc(32, 7);
    setSharedFolderKeySource((folder) => (folder === 'executive' ? Buffer.from(key) : undefined));
    const first = user('eve', ['reader', 'executive']);
    // Nothing asked yet: no key.
    expect(dekFor(first, SHARED_FOLDER_OWNER, 'executive')).toBeUndefined();
    expect(await permitsInSharedFolder(pdp, first, 'page-read', 'executive')).toBe(true);
    expect(openedFor(first, 'executive')).toBe(true);
    expect(dekFor(first, SHARED_FOLDER_OWNER, 'executive')?.equals(key)).toBe(true);
    // Permitted on one folder is not another.
    expect(sharedFolderKeyFor(first, 'default')).toBeUndefined();

    // The grant is removed (the executive policy goes). The next request has a new subject.
    policies = policies.filter((p) => p.id !== executivePolicy.id);
    const next = user('eve', ['reader', 'executive']);
    expect(dekFor(next, SHARED_FOLDER_OWNER, 'executive')).toBeUndefined();
    expect(await permitsInSharedFolder(pdp, next, 'page-read', 'executive')).toBe(false);
    expect(dekFor(next, SHARED_FOLDER_OWNER, 'executive')).toBeUndefined();
    expect(await decide(next, 'view', BOARD)).toBe(false);
  });

  test('never by link: a share subject is refused without asking, and no share action is allowed in a folder', async () => {
    const viaShare = { ...user('rita', ['reader', 'vault-owner']), viaShare: { id: 's1', issuer: 'rita', resources: [], actions: ['page-read'] } } as never;
    expect(await permitsInSharedFolder(pdp, viaShare, 'page-read', 'default')).toBe(false);
    // Refused before any PDP is asked: even one that permits everything.
    const asked: unknown[] = [];
    const yes = { decide: (s: unknown) => { asked.push(s); return Promise.resolve({ permit: true }); } };
    expect(await permitsInSharedFolder(yes, viaShare, 'page-read', 'default')).toBe(false);
    expect(asked).toEqual([]);
    expect(await decide(viaShare, 'view', MINUTES)).toBe(false);
    const reader = user('rita', ['reader', 'vault-owner']);
    for (const action of ['share-create', 'share-extend', 'page-export']) {
      expect(await permitsInVault(pdp as never, reader, action, { owner: SHARED_FOLDER_OWNER, vault: 'default', resource: MINUTES })).toBe(false);
    }
  });
});
