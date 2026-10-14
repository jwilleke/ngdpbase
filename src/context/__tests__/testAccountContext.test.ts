/**
 * #1805 — the test-account flag reaches every context a plugin or add-on reads
 * the user from: the account record through the PolicyInformationPoint's
 * subject (what the session middleware writes to `req.userContext`), then
 * `WikiContext.userContext`, the ParseContext a plugin is handed, and
 * `ApiContext.isTest` for an add-on route. Real UserManager, PIP, WikiContext,
 * ParseContext and ApiContext; only storage and roles are stubbed.
 *
 * Sabotaged once (then restored): `isTest: user.isTest === true` dropped from
 * UserManager's publicRecord — the "saved before the flag" case went red
 * (undefined, not false).
 */
import UserManager from '../../managers/UserManager';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import WikiContext from '../WikiContext';
import { ApiContext } from '../ApiContext';
import ParseContext from '../../parsers/context/ParseContext';
import type { WikiEngine } from '../../types/WikiEngine';

function setUp(records: Record<string, Record<string, unknown>>) {
  const engine = {
    getManager: (name: string) => {
      if (name === 'UserManager') return um;
      if (name === 'RoleManager') return { resolveUserRoles: async () => ['reader'] };
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      return null;
    }
  } as unknown as WikiEngine;
  const um = new UserManager(engine);
  (um as unknown as { provider: unknown }).provider = { getUser: async (n: string) => records[n] ?? null };
  return { engine, pip: new PolicyInformationPoint(engine) };
}

const account = (username: string, extra: Record<string, unknown> = {}) => ({
  username, email: `${username}@example.com`, displayName: username, password: 'h', isActive: true, isSystem: false, isExternal: false, ...extra
});

async function contextsFor(username: string, records: Record<string, Record<string, unknown>>) {
  const { engine, pip } = setUp(records);
  const subject = await pip.subjectFor(username);
  if (!subject) throw new Error('no subject');
  const wikiContext = new WikiContext(engine, { userContext: subject });
  const parse = new ParseContext('', { pageContext: { pageName: 'Home', userContext: subject, requestInfo: {} }, engine, wikiContext }, engine);
  const api = ApiContext.from({ userContext: subject, session: {} }, engine);
  return { subject, wikiContext, parse, api };
}

describe('#1805 isTest in every context', () => {
  test('a test account: true in req.userContext, WikiContext, ParseContext and ApiContext', async () => {
    const c = await contextsFor('qa', { qa: account('qa', { isTest: true }) });
    expect(c.subject.isTest).toBe(true);
    expect(c.wikiContext.userContext.isTest).toBe(true);
    expect(c.parse.wikiContext.userContext?.isTest).toBe(true);
    expect(c.api.isTest).toBe(true);
  });

  test('a real account: false everywhere', async () => {
    const c = await contextsFor('jim', { jim: account('jim', { isTest: false }) });
    expect(c.wikiContext.userContext.isTest).toBe(false);
    expect(c.parse.wikiContext.userContext?.isTest).toBe(false);
    expect(c.api.isTest).toBe(false);
  });

  test('an account saved before the flag: false, never undefined', async () => {
    const c = await contextsFor('old', { old: account('old') });
    expect(c.wikiContext.userContext.isTest).toBe(false);
    expect(c.api.isTest).toBe(false);
  });

  test('the anonymous visitor is not a test account', () => {
    const { engine, pip } = setUp({});
    expect(ApiContext.from({ userContext: pip.anonymousSubject(), session: {} }, engine).isTest).toBe(false);
  });
});
