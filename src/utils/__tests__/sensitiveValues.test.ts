/**
 * Which configuration values may be shown, and to whom (#1750).
 */
import { valueLevels, secretKeys, levelOf, shownValue, usesLegacyName, HIDDEN } from '../sensitiveValues';

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
});
