/**
 * Which configuration values may be shown, and to whom (#1750).
 */
import { valueLevels, secretKeys, levelOf, shownValue, usesLegacyName, HIDDEN, NO_SECRETS, hideDeclaredPaths, keepHiddenValues, secretValuesBelow, sensitiveValueProblems } from '../sensitiveValues';

const reader = (config: Record<string, unknown>) => (key: string, fallback: unknown) => (key in config ? config[key] : fallback);
const anonymous = { sensitive: false, secret: false };
const admin = { sensitive: true, secret: false };
const revealer = { sensitive: true, secret: true };

describe('sensitive values (#1750)', () => {
  test('levels come from the list, with the old name as an alias, and an entry can be removed', () => {
    const levels = valueLevels(reader({
      'ngdpbase.config.secret-keys': { 'old.secret': true },
      'ngdpbase.config.sensitive-values': { 'a.secret': 'secret', 'a.path': 'sensitive', 'old.secret': null, 'b.legacy': true }
    }));
    expect(Object.fromEntries(levels)).toEqual({ 'a.secret': 'secret', 'a.path': 'sensitive', 'b.legacy': 'secret' });
    expect(secretKeys(reader({ 'ngdpbase.config.sensitive-values': { s: 'secret', p: 'sensitive' } }))).toEqual(['s']);
    expect(usesLegacyName(reader({ 'ngdpbase.config.secret-keys': { x: true } }))).toBe(true);
    expect(usesLegacyName(reader({}))).toBe(false);
  });

  test('an unlisted key whose name looks secret is secret — but only for a string value', () => {
    const none = new Map();
    expect(levelOf('ngdpbase.x.client-secret', none, 'abc')).toBe('secret');
    expect(levelOf('ngdpbase.x.apiKey', none, 'abc')).toBe('secret');
    expect(levelOf('ngdpbase.auth.password.enabled', none, true)).toBeNull();
    expect(levelOf('ngdpbase.app.name', none, 'abc')).toBeNull();
  });

  test('who sees what', () => {
    const levels = new Map([['k.secret', 'secret' as const], ['k.path', 'sensitive' as const]]);
    expect(shownValue('k.secret', 's3cr3t', levels, anonymous)).toBe(HIDDEN);
    expect(shownValue('k.secret', 's3cr3t', levels, admin)).toBe(HIDDEN);
    expect(shownValue('k.secret', 's3cr3t', levels, revealer)).toBe('s3cr3t');
    expect(shownValue('k.path', '/srv/x', levels, anonymous)).toBe(HIDDEN);
    expect(shownValue('k.path', '/srv/x', levels, admin)).toBe('/srv/x');
    expect(shownValue('k.plain', 'hello', levels, anonymous)).toBe('hello');
    // "not set" reveals nothing
    expect(shownValue('k.secret', '', levels, anonymous)).toBe('');
  });

  test('secret-looking fields inside an object value are hidden from anyone without secret-reveal', () => {
    const clients = [{ client_id: 'app', client_secret: 'xyz', redirect_uris: ['https://a.example.com'] }];
    expect(shownValue('oidc-auth-server.clients', clients, new Map(), admin))
      .toEqual([{ client_id: 'app', client_secret: HIDDEN, redirect_uris: ['https://a.example.com'] }]);
    expect(shownValue('oidc-auth-server.clients', clients, new Map(), revealer)).toEqual(clients);
  });

  test('an outside provider\'s client-secret and private-key references are hidden inside the providers map (#1743)', () => {
    const levels = new Map([['ngdpbase.auth.oidc.providers', 'sensitive' as const]]);
    const providers = { apple: { preset: 'apple', 'key-id': 'K1', 'private-key': '$APPLE_KEY' }, google: { 'client-secret': '$GOOGLE_KEY' } };
    expect(shownValue('ngdpbase.auth.oidc.providers', providers, levels, admin))
      .toEqual({ apple: { preset: 'apple', 'key-id': 'K1', 'private-key': HIDDEN }, google: { 'client-secret': HIDDEN } });
  });
});

describe('sensitive values inside a map, by path (#1889)', () => {
  const ACCOUNTS = 'ngdpbase.addons.accounting.accounts';
  const levels = valueLevels(reader({
    'ngdpbase.config.sensitive-values': { [`${ACCOUNTS}.*.account-number`]: 'secret', [`${ACCOUNTS}.*.routing-number`]: 'sensitive' }
  }));
  const accounts = {
    checking: { name: 'Checking', default: true, 'routing-number': '021000021', 'account-number': '123456789012' },
    savings: { name: 'Savings', 'routing-number': '021000021', 'account-number': '$SAVINGS_ACCOUNT_NUMBER' },
    cash: { name: 'Cash', 'account-number': '' }
  };

  test('a wildcard entry hides the value in every entry of the map; a non-matching sibling is shown', () => {
    const shown = shownValue(ACCOUNTS, accounts, levels, anonymous) as typeof accounts;
    expect(shown.checking['account-number']).toBe(HIDDEN);
    expect(shown.checking['routing-number']).toBe(HIDDEN);
    expect(shown.checking.name).toBe('Checking');
    expect(shown.checking.default).toBe(true);
    // a bare reference is a pointer to the environment, not the secret; "not set" reveals nothing
    expect(shown.savings['account-number']).toBe('$SAVINGS_ACCOUNT_NUMBER');
    expect(shown.cash['account-number']).toBe('');
    expect(JSON.stringify(shown)).not.toContain('123456789012');
  });

  test('each path keeps its own level: sensitive for admin-read, secret only for secret-reveal', () => {
    const forAdmin = shownValue(ACCOUNTS, accounts, levels, admin) as typeof accounts;
    expect(forAdmin.checking['routing-number']).toBe('021000021');
    expect(forAdmin.checking['account-number']).toBe(HIDDEN);
    expect(shownValue(ACCOUNTS, accounts, levels, revealer)).toEqual(accounts);
  });

  test('the value given is never changed', () => {
    hideDeclaredPaths(ACCOUNTS, accounts, levels, NO_SECRETS);
    expect(accounts.checking['account-number']).toBe('123456789012');
  });

  test('an entry naming a whole map entry hides all of it; a list index is a segment', () => {
    const whole = valueLevels(reader({ 'ngdpbase.config.sensitive-values': { 'ngdpbase.x.list.*.token': 'secret', 'ngdpbase.x.map.private': 'secret' } }));
    expect(hideDeclaredPaths('ngdpbase.x.list', [{ token: 'abcdefgh', id: 1 }], whole, NO_SECRETS)).toEqual([{ token: HIDDEN, id: 1 }]);
    expect(hideDeclaredPaths('ngdpbase.x.map', { private: { a: 1 }, public: { b: 2 } }, whole, NO_SECRETS)).toEqual({ private: HIDDEN, public: { b: 2 } });
  });

  test('the strings at secret paths, with their full paths, are what log redaction strikes', () => {
    expect(secretValuesBelow(ACCOUNTS, accounts, levels)).toEqual([
      { path: `${ACCOUNTS}.checking.account-number`, value: '123456789012' },
      { path: `${ACCOUNTS}.savings.account-number`, value: '$SAVINGS_ACCOUNT_NUMBER' },
      { path: `${ACCOUNTS}.cash.account-number`, value: '' }
    ]);
  });

  test('a hidden placeholder sent back keeps the stored value; an edited value is taken', () => {
    const submitted = {
      checking: { ...accounts.checking, name: 'Main', 'account-number': HIDDEN },
      savings: { ...accounts.savings, 'account-number': '$NEW_SAVINGS' }
    };
    const kept = keepHiddenValues(ACCOUNTS, submitted, accounts, levels) as typeof accounts;
    expect(kept.checking['account-number']).toBe('123456789012');
    expect(kept.checking.name).toBe('Main');
    expect(kept.savings['account-number']).toBe('$NEW_SAVINGS');
    // a HIDDEN outside a declared path is the operator's own text
    expect(keepHiddenValues(ACCOUNTS, { checking: { name: HIDDEN } }, accounts, levels)).toEqual({ checking: { name: HIDDEN } });
  });

  test('an invalid entry hides nothing and is named; a valid one is kept', () => {
    const read = reader({
      'ngdpbase.config.sensitive-values': {
        'ngdpbase.addons.accounting.acc*.account-number': 'secret',
        'ngdpbase..x': 'secret',
        'ngdpbase.*.password': 'secret',
        'ngdpbase.addons.accounting.accounts.*.pin': 'secrett',
        [`${ACCOUNTS}.*.account-number`]: 'secret'
      }
    });
    expect([...valueLevels(read).keys()]).toEqual([`${ACCOUNTS}.*.account-number`]);
    const problems = sensitiveValueProblems(read);
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toContain("'ngdpbase.addons.accounting.acc*.account-number' is not a configuration key or path");
    expect(problems.join('\n')).toContain('has level "secrett"');
  });
});
