/**
 * hasPermissionOn(action, pageName) — a capability asked about the page it is
 * for (#1539). For a vault page: the container rule (the owner, never a role)
 * and then the capability with the page's vault, so the `vault-owner` policy
 * decides. For any other page: plain hasPermission. Run against the SHIPPED
 * policies.
 */
vi.unmock('../../managers/PolicyEvaluator');
import fs from 'fs';
import path from 'path';
import BaseContext, { type EngineLike } from '../BaseContext';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import { formatPrivatePageName } from '../../utils/privateStorePath';
import type { PermissionSubject } from '../../managers/UserManager.js';

class TestContext extends BaseContext {
  constructor(engine: EngineLike, subject: PermissionSubject | null) {
    super(engine, subject);
  }
}

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

function engine(): EngineLike {
  const configManager = { getProperty: (key: string, def: unknown) => (key in shipped ? shipped[key] : def) };
  const managers: Record<string, unknown> = { ConfigurationManager: configManager };
  const e = { getManager: (n: string) => managers[n] ?? null } as EngineLike;
  managers.PolicyDecisionPoint = new PolicyDecisionPoint(e as never);
  const pe = new PolicyEvaluator(e as never);
  (pe as unknown as { configManager: unknown }).configManager = configManager;
  managers.PolicyEvaluator = pe;
  return e;
}

const subject = (username: string, roles: string[]) => ({ username, roles, isAuthenticated: true }) as PermissionSubject;
const ALICE_DIARY = formatPrivatePageName('alice', 'default', 'Diary');

describe('hasPermissionOn (#1539)', () => {
  test('a reader with vault-owner may create and edit in their own vault', async () => {
    const ctx = new TestContext(engine(), subject('alice', ['reader', 'vault-owner']));
    expect(await ctx.hasPermissionOn('page-create', ALICE_DIARY)).toBe(true);
    expect(await ctx.hasPermissionOn('page-edit', ALICE_DIARY)).toBe(true);
  });

  test('…but not on a public page, where their role decides', async () => {
    const ctx = new TestContext(engine(), subject('alice', ['reader', 'vault-owner']));
    expect(await ctx.hasPermissionOn('page-edit', 'Main')).toBe(false);
    expect(await ctx.hasPermissionOn('page-read', 'Main')).toBe(true);
  });

  test('without vault-owner, even an editor is refused in their own vault', async () => {
    const ctx = new TestContext(engine(), subject('alice', ['editor']));
    expect(await ctx.hasPermissionOn('page-edit', ALICE_DIARY)).toBe(false);
    expect(await ctx.hasPermissionOn('page-edit', 'Main')).toBe(true);
  });

  test('another person’s vault is refused whatever their roles', async () => {
    const ctx = new TestContext(engine(), subject('bob', ['admin', 'vault-owner']));
    expect(await ctx.hasPermissionOn('page-read', ALICE_DIARY)).toBe(false);
    expect(await ctx.hasPermissionOn('page-create', ALICE_DIARY)).toBe(false);
  });
});
