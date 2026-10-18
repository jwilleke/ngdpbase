/**
 * #1889: a secret inside a configuration map (an account number inside the
 * accounting add-on's accounts map), named by a wildcard path in
 * `ngdpbase.config.sensitive-values`, is never sent to the admin
 * configuration screen, and saving an edit there keeps it.
 *
 * As in WikiRoutes.configSecrets.test.ts, these assert on what reaches the
 * template, not on markup.
 */

import WikiRoutes from '../WikiRoutes';

const adminUser = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
const ACCOUNTS = 'ngdpbase.addons.accounting.accounts';
const NUMBER = '123456789012';

const stored = () => ({
  checking: { name: 'Checking', kind: 'bank', 'routing-number': '021000021', 'account-number': NUMBER },
  savings: { name: 'Savings', kind: 'bank', 'account-number': '$SAVINGS_ACCOUNT_NUMBER' }
});

function makeRoutes(config: Record<string, unknown>) {
  const configManager = {
    getProperty: vi.fn((key: string, def: unknown) => (key in config ? config[key] : def)),
    getDefaultProperties: () => ({ ...config }),
    getCustomProperties: () => ({ [ACCOUNTS]: config[ACCOUNTS] }),
    getAllProperties: () => ({ ...config }),
    getEnvControlledKeys: () => ({ [ACCOUNTS]: 'NGDPBASE_ACCOUNTS' }),
    describeProperty: () => ({ envControlled: true, envVar: 'NGDPBASE_ACCOUNTS', source: 'config', effective: config[ACCOUNTS] }),
    setProperty: vi.fn().mockResolvedValue(undefined)
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn().mockResolvedValue(true) };
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  return { routes, configManager };
}

const req = (body: Record<string, unknown> = {}) => ({
  params: {},
  query: {},
  body,
  session: { csrfToken: 'tok' },
  path: '/admin/configuration',
  originalUrl: '/admin/configuration',
  protocol: 'http',
  headers: { 'x-requested-with': 'XMLHttpRequest' },
  xhr: true,
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: adminUser
});

const res = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis()
});

describe('GET /admin/configuration — a secret inside a map is never sent (#1889)', () => {
  const config = {
    'ngdpbase.config.sensitive-values': { [`${ACCOUNTS}.*.account-number`]: 'secret' },
    [ACCOUNTS]: stored()
  };

  test('hidden in every property map and in the environment view; siblings and a $NAME reference are shown', async () => {
    const r = res();
    await makeRoutes(config).routes.adminConfiguration(req(), r);
    const data = r.render.mock.calls[0][1] as Record<string, Record<string, unknown>>;
    expect(JSON.stringify(data)).not.toContain(NUMBER);
    for (const map of ['mergedProperties', 'customProperties', 'defaultProperties'] as const) {
      const accounts = data[map][ACCOUNTS] as ReturnType<typeof stored>;
      expect(accounts.checking['account-number']).toBe('(hidden)');
      expect(accounts.checking['routing-number']).toBe('021000021');
      expect(accounts.checking.name).toBe('Checking');
      expect(accounts.savings['account-number']).toBe('$SAVINGS_ACCOUNT_NUMBER');
    }
    const env = data.envControlled[ACCOUNTS] as { effective: ReturnType<typeof stored> };
    expect(env.effective.checking['account-number']).toBe('(hidden)');
  });

  test('without the entry, the value is shown (the entry is what hides it)', async () => {
    const r = res();
    await makeRoutes({ [ACCOUNTS]: stored() }).routes.adminConfiguration(req(), r);
    expect(JSON.stringify(r.render.mock.calls[0][1])).toContain(NUMBER);
  });
});

describe('POST /admin/configuration — saving a map shown with hidden paths keeps them (#1889)', () => {
  test('a (hidden) placeholder sent back is replaced by the stored value; edits are kept', async () => {
    const config = {
      'ngdpbase.config.sensitive-values': { [`${ACCOUNTS}.*.account-number`]: 'secret' },
      [ACCOUNTS]: stored()
    };
    const { routes, configManager } = makeRoutes(config);
    configManager.getEnvControlledKeys = () => ({});
    vi.spyOn(routes as unknown as { freshEnough: () => Promise<boolean> }, 'freshEnough').mockResolvedValue(true);
    const submitted = { ...stored(), checking: { ...stored().checking, name: 'Main checking', 'account-number': '(hidden)' } };
    await routes.adminUpdateConfiguration(req({ property: ACCOUNTS, value: JSON.stringify(submitted) }), res());
    expect(configManager.setProperty).toHaveBeenCalledTimes(1);
    const written = configManager.setProperty.mock.calls[0][1] as ReturnType<typeof stored>;
    expect(written.checking['account-number']).toBe(NUMBER);
    expect(written.checking.name).toBe('Main checking');
    expect(written.savings['account-number']).toBe('$SAVINGS_ACCOUNT_NUMBER');
  });
});
