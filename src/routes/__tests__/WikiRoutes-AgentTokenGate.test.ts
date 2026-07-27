/**
 * @file WikiRoutes-AgentTokenGate.test.ts
 * @description #981 — a token that cannot authenticate must not be issuable.
 *
 * `AgentTokenManager` is registered unconditionally by `WikiEngine`, but
 * `AuthManager` only registers the `agent-token` auth provider when
 * `ngdpbase.auth.agent-token.enabled` is true. The mint route checked only for
 * the manager, so on a default (disabled) instance it happily minted tokens
 * that could never authenticate — and using one failed as
 * "Forbidden — invalid CSRF token", pointing at the wrong subsystem entirely.
 */
import WikiRoutes from '../WikiRoutes';

type Gated = { engine: unknown; agentTokensEnabled(): boolean };

const makeRoutes = (opts: { manager?: boolean; enabled?: unknown }) => {
  const routes = Object.create(WikiRoutes.prototype) as Gated;
  routes.engine = {
    getManager: (n: string) => {
      if (n === 'AgentTokenManager') return opts.manager === false ? null : { mint: () => {} };
      if (n === 'ConfigurationManager') return { getProperty: () => opts.enabled };
      return null;
    }
  };
  return routes;
};

describe('#981 agent token enablement gate', () => {
  test('enabled only when BOTH the manager exists and config says so', () => {
    expect(makeRoutes({ manager: true, enabled: true }).agentTokensEnabled()).toBe(true);
  });

  test('disabled when the config flag is false, even though the manager exists', () => {
    // The exact production shape: WikiEngine always registers the manager, so
    // this is the default state of every instance that has not opted in.
    expect(makeRoutes({ manager: true, enabled: false }).agentTokensEnabled()).toBe(false);
  });

  test('disabled when the config flag is absent', () => {
    expect(makeRoutes({ manager: true, enabled: undefined }).agentTokensEnabled()).toBe(false);
  });

  test('disabled when the manager is missing', () => {
    expect(makeRoutes({ manager: false, enabled: true }).agentTokensEnabled()).toBe(false);
  });

  test('matches the condition AuthManager uses to register the provider', () => {
    // The whole point: these two gates must agree. If AuthManager registers on
    // `enabled` and the routes gate on anything else, an instance can mint
    // credentials that its own middleware will refuse.
    for (const enabled of [true, false]) {
      expect(makeRoutes({ manager: true, enabled }).agentTokensEnabled()).toBe(enabled);
    }
  });
});
