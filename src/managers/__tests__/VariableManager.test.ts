/**
 * VariableManager tests
 *
 * Covers:
 * - initialize() registers core variables
 * - expandVariables() with empty/non-string content
 * - expandVariables() resolves known variable
 * - expandVariables() keeps unknown variable as-is
 * - expandVariables() handles handler throwing → [Error: ...]
 * - expandVariables() handles async handler → returns match
 * - expandVariables() resolves multiple variables
 * - getVariable() returns value for known variable
 * - getVariable() returns [Unknown: name] for unknown variable
 * - getVariable() handles async handler → [Async]
 * - getVariable() handles handler error → [Error: message]
 * - registerVariable() adds custom variable
 * - registerVariable() overwrites existing
 * - getDebugInfo() returns debug info object
 * - Built-in variables: appName, version, date, time, year, month, day
 * - Contextual variables: pagename, username, loginstatus, userroles
 *
 * @jest-environment node
 */

import VariableManager from '../VariableManager';
import type { WikiEngine } from '../../types/WikiEngine';

function makeEngine(): WikiEngine {
  return {
    getManager: vi.fn(() => null)
  };
}

async function makeInitializedManager(): Promise<VariableManager> {
  const vm = new VariableManager(makeEngine());
  await vm.initialize();
  return vm;
}

describe('VariableManager', () => {
  describe('initialize()', () => {
    test('registers core variables', async () => {
      const vm = await makeInitializedManager();
      const info = vm.getDebugInfo();
      expect(info.totalVariables).toBeGreaterThan(10);
    });
  });

  describe('expandVariables()', () => {
    test('returns empty string for empty content', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('')).toBe('');
    });

    test('returns content unchanged when no variable patterns', async () => {
      const vm = await makeInitializedManager();
      const text = 'No variables here.';
      expect(vm.expandVariables(text)).toBe(text);
    });

    test('expands known variable [{$version}]', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$version}]');
      expect(result).not.toBe('[{$version}]');
      expect(typeof result).toBe('string');
    });

    test('keeps unknown variable as-is', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('[{$unknownvar12345}]')).toBe('[{$unknownvar12345}]');
    });

    test('expands multiple variables', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$year}] - [{$month}] - [{$day}]');
      // Should not still have variable patterns
      expect(result).not.toContain('[{$year}]');
      expect(result).not.toContain('[{$month}]');
    });

    test('handles handler that throws → [Error: ...]', async () => {
      const vm = await makeInitializedManager();
      vm.registerVariable('badvar', () => { throw new Error('exploded'); });
      const result = vm.expandVariables('[{$badvar}]');
      expect(result).toContain('[Error:');
    });

    test('handles async handler → returns original match', async () => {
      const vm = await makeInitializedManager();
      vm.registerVariable('asyncvar', () => Promise.resolve('future') as unknown as string);
      const result = vm.expandVariables('[{$asyncvar}]');
      expect(result).toBe('[{$asyncvar}]');
    });

    test('expands pagename from context', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$pagename}]', { pageName: 'MyPage' });
      expect(result).toBe('MyPage');
    });

    test('expands username from context', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$username}]', {
        userContext: { username: 'alice', isAuthenticated: true, roles: [], displayName: 'Alice' }
      });
      expect(result).toBe('alice');
    });

    test('expands loginstatus for authenticated user', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$loginstatus}]', {
        userContext: { isAuthenticated: true, username: 'u', roles: [] }
      });
      expect(result).toContain('Logged in');
    });

    test('expands userroles from context', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$userroles}]', {
        userContext: { username: 'u', isAuthenticated: true, roles: ['admin', 'user'] }
      });
      expect(result).toContain('admin');
    });
  });

  describe('getVariable()', () => {
    test('returns value for known variable', async () => {
      const vm = await makeInitializedManager();
      const result = vm.getVariable('year');
      expect(typeof result).toBe('string');
      expect(parseInt(result)).toBeGreaterThan(2020);
    });

    test('returns [Unknown: name] for unknown variable', async () => {
      const vm = await makeInitializedManager();
      expect(vm.getVariable('unknownxyz')).toBe('[Unknown: unknownxyz]');
    });

    test('handles async handler → [Async]', async () => {
      const vm = await makeInitializedManager();
      vm.registerVariable('asyncget', () => Promise.resolve('v') as unknown as string);
      expect(vm.getVariable('asyncget')).toBe('[Async]');
    });

    test('handles handler error → [Error: message]', async () => {
      const vm = await makeInitializedManager();
      vm.registerVariable('errvar', () => { throw new Error('oops'); });
      expect(vm.getVariable('errvar')).toContain('[Error:');
    });
  });

  describe('registerVariable()', () => {
    test('registers and uses a custom variable', async () => {
      const vm = await makeInitializedManager();
      vm.registerVariable('myvar', () => 'custom-value');
      expect(vm.expandVariables('[{$myvar}]')).toBe('custom-value');
    });

    test('overwrites existing handler', async () => {
      const vm = await makeInitializedManager();
      vm.registerVariable('version', () => 'overridden');
      expect(vm.expandVariables('[{$version}]')).toBe('overridden');
    });
  });

  describe('getDebugInfo()', () => {
    test('returns object with totalVariables, systemVariables, contextualVariables, allVariables', async () => {
      const vm = await makeInitializedManager();
      const info = vm.getDebugInfo();
      expect(typeof info.totalVariables).toBe('number');
      expect(Array.isArray(info.systemVariables)).toBe(true);
      expect(Array.isArray(info.contextualVariables)).toBe(true);
      expect(Array.isArray(info.allVariables)).toBe(true);
    });

    test('systemVariables includes appname', async () => {
      const vm = await makeInitializedManager();
      const info = vm.getDebugInfo();
      expect(info.systemVariables).toContain('appname');
    });

    test('contextualVariables includes pagename', async () => {
      const vm = await makeInitializedManager();
      const info = vm.getDebugInfo();
      expect(info.contextualVariables).toContain('pagename');
    });
  });

  describe('built-in variables', () => {
    test('[{$year}] returns current year', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$year}]');
      expect(parseInt(result)).toBe(new Date().getFullYear());
    });

    test('[{$month}] returns current month (1-12)', async () => {
      const vm = await makeInitializedManager();
      const month = parseInt(vm.expandVariables('[{$month}]'));
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    });

    test('[{$day}] returns current day (1-31)', async () => {
      const vm = await makeInitializedManager();
      const day = parseInt(vm.expandVariables('[{$day}]'));
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(31);
    });

    test('[{$appname}] returns app name string', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$appname}]');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('[{$timestamp}] returns ISO string without timezone context', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$timestamp}]');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('[{$timestamp}] with timezone in context returns locale string', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$timestamp}]', {
        userContext: { username: 'u', isAuthenticated: true, roles: [], timezone: 'America/New_York' }
      });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('[{$uptime}] returns unknown when no startTime', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('[{$uptime}]')).toBe('unknown');
    });

    test('[{$uptime}] returns formatted uptime when engine has startTime', async () => {
      const engineWithTime = {
        getManager: vi.fn(() => null),
        startTime: Date.now() - 3661000
      } as unknown as import('../../types/WikiEngine').WikiEngine;
      const vm = new VariableManager(engineWithTime);
      await vm.initialize();
      const result = vm.expandVariables('[{$uptime}]');
      expect(result).toMatch(/\d+h \d+m \d+s/);
    });

    test('[{$totalpages}] returns 0 when no PageManager', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('[{$totalpages}]')).toBe('0');
    });

    test('[{$displayname}] returns Anonymous with no context', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('[{$displayname}]')).toBe('Anonymous');
    });

    test('[{$displayname}] returns displayName from context', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$displayname}]', {
        userContext: { username: 'bob', isAuthenticated: true, roles: [], displayName: 'Robert' }
      });
      expect(result).toBe('Robert');
    });

    test('[{$displayname}] falls back to username when no displayName', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$displayname}]', {
        userContext: { username: 'bob', isAuthenticated: true, roles: [] }
      });
      expect(result).toBe('bob');
    });
  });

  describe('requestInfo variables', () => {
    test('[{$useragent}] returns Unknown with no requestInfo', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('[{$useragent}]')).toBe('Unknown');
    });

    test('[{$useragent}] returns user agent string from requestInfo', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$useragent}]', {
        requestInfo: { userAgent: 'Mozilla/5.0', clientIp: '127.0.0.1', referer: '', sessionId: '', acceptLanguage: '' }
      });
      expect(result).toBe('Mozilla/5.0');
    });

    test('[{$clientip}] returns Unknown with no requestInfo', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('[{$clientip}]')).toBe('Unknown');
    });

    test('[{$clientip}] returns IP from requestInfo', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$clientip}]', {
        requestInfo: { userAgent: '', clientIp: '192.168.1.1', referer: '', sessionId: '', acceptLanguage: '' }
      });
      expect(result).toBe('192.168.1.1');
    });

    test('[{$referer}] returns Direct with no requestInfo', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('[{$referer}]')).toBe('Direct');
    });

    test('[{$referer}] returns referer from requestInfo', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$referer}]', {
        requestInfo: { userAgent: '', clientIp: '', referer: 'https://example.com', sessionId: '', acceptLanguage: '' }
      });
      expect(result).toBe('https://example.com');
    });

    test('[{$sessionid}] returns None with no requestInfo', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('[{$sessionid}]')).toBe('None');
    });

    test('[{$sessionid}] returns session ID from requestInfo', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$sessionid}]', {
        requestInfo: { userAgent: '', clientIp: '', referer: '', sessionId: 'abc-123', acceptLanguage: '' }
      });
      expect(result).toBe('abc-123');
    });

    test('[{$acceptlanguage}] returns Unknown with no requestInfo', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('[{$acceptlanguage}]')).toBe('Unknown');
    });

    test('[{$acceptlanguage}] returns language from requestInfo', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$acceptlanguage}]', {
        requestInfo: { userAgent: '', clientIp: '', referer: '', sessionId: '', acceptLanguage: 'en-US,en;q=0.9' }
      });
      expect(result).toBe('en-US,en;q=0.9');
    });
  });

  describe('browser detection via [{$browser}]', () => {
    async function getBrowser(ua: string): Promise<string> {
      const vm = await makeInitializedManager();
      return vm.expandVariables('[{$browser}]', {
        requestInfo: { userAgent: ua, clientIp: '', referer: '', sessionId: '', acceptLanguage: '' }
      });
    }

    test('returns Unknown with no requestInfo', async () => {
      const vm = await makeInitializedManager();
      expect(vm.expandVariables('[{$browser}]')).toBe('Unknown');
    });

    test('detects Chrome', async () => {
      expect(await getBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36')).toMatch(/Chrome/);
    });

    test('detects Firefox', async () => {
      expect(await getBrowser('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0')).toMatch(/Firefox/);
    });

    test('detects Safari', async () => {
      expect(await getBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/16.0 Safari/605.1.15')).toMatch(/Safari/);
    });

    test('detects Edge', async () => {
      expect(await getBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0')).toMatch(/Edge/);
    });

    test('detects Opera', async () => {
      expect(await getBrowser('Opera/9.80 (Windows NT 6.1) Presto/2.12.388 Version/12.14')).toMatch(/Opera/);
    });

    test('returns Unknown Browser for unrecognised agent', async () => {
      expect(await getBrowser('SomeObscureBotClient/1.0')).toBe('Unknown Browser');
    });
  });

  describe('date/time with user preferences', () => {
    test('[{$date}] uses dateFormat preference', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$date}]', {
        userContext: { username: 'u', isAuthenticated: true, roles: [], preferences: { dateFormat: 'yyyy-MM-dd' } }
      });
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('[{$time}] uses 24h timeFormat preference', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$time}]', {
        userContext: { username: 'u', isAuthenticated: true, roles: [], preferences: { timeFormat: '24h' } }
      });
      expect(typeof result).toBe('string');
    });

    test('[{$time}] uses 12h timeFormat preference', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$time}]', {
        userContext: { username: 'u', isAuthenticated: true, roles: [], preferences: { timeFormat: '12h' } }
      });
      expect(typeof result).toBe('string');
    });

    test('[{$date}] uses locale from acceptLanguage header', async () => {
      const vm = await makeInitializedManager();
      const result = vm.expandVariables('[{$date}]', {
        requestInfo: { userAgent: '', clientIp: '', referer: '', sessionId: '', acceptLanguage: 'fr-FR' }
      });
      expect(typeof result).toBe('string');
    });
  });
});

/**
 * #1104 — variables documented in docs/managers/VariableManager.md but never
 * registered. An unregistered name is returned verbatim by expandVariables(),
 * so the reader saw the raw placeholder. These assert the documented set
 * actually resolves, and that each degrades sanely when its manager is absent.
 */
describe('#1104 documented variables', () => {
  const DOCUMENTED = [
    'encoding',
    'frontpage',
    'ngdpbaseversion',
    'pageprovider',
    'pageproviderdescription',
    'requestcontext',
    'interwikilinks',
    'inlinedimages'
  ];

  function makeConfiguredEngine(): WikiEngine {
    const config: Record<string, unknown> = {
      'ngdpbase.encoding': 'UTF-8',
      'ngdpbase.front-page': 'Welcome',
      'ngdpbase.version': '4.11.1',
      'ngdpbase.features.images.enabled': true,
      'ngdpbase.interwiki.sites': {
        Wikipedia: {}, JSPWiki: {}, GVP: {}, 'GVP-COUNTRY': {}, geo: {}, grok: {}
      }
    };
    return {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') {
          return {
            getProperty: (key: string, fallback?: unknown) =>
              key in config ? config[key] : fallback
          };
        }
        if (name === 'PageManager') {
          return {
            getCurrentPageProvider: () => ({
              getProviderInfo: () => ({
                name: 'VersioningFileProvider',
                version: '1.0.0',
                description: 'File storage with version history and delta storage'
              })
            })
          };
        }
        return null;
      })
    } as WikiEngine;
  }

  test.each(DOCUMENTED)('[{$%s}] is registered', async (name) => {
    const vm = await makeInitializedManager();
    expect(vm.getDebugInfo().allVariables).toContain(name);
  });

  test.each(DOCUMENTED)('[{$%s}] does not render as the raw placeholder', async (name) => {
    const vm = new VariableManager(makeConfiguredEngine());
    await vm.initialize();
    expect(vm.expandVariables(`[{$${name}}]`)).not.toBe(`[{$${name}}]`);
  });

  test('resolves documented values from configuration', async () => {
    const vm = new VariableManager(makeConfiguredEngine());
    await vm.initialize();
    expect(vm.expandVariables('[{$encoding}]')).toBe('UTF-8');
    expect(vm.expandVariables('[{$frontpage}]')).toBe('Welcome');
    expect(vm.expandVariables('[{$ngdpbaseversion}]')).toBe('4.11.1');
    expect(vm.expandVariables('[{$inlinedimages}]')).toBe('true');
    expect(vm.expandVariables('[{$interwikilinks}]')).toBe('6');
  });

  test('resolves provider name and description from the page provider', async () => {
    const vm = new VariableManager(makeConfiguredEngine());
    await vm.initialize();
    expect(vm.expandVariables('[{$pageprovider}]')).toBe('VersioningFileProvider');
    expect(vm.expandVariables('[{$pageproviderdescription}]'))
      .toBe('File storage with version history and delta storage');
  });

  test('requestcontext defaults to view and honours the context', async () => {
    const vm = new VariableManager(makeConfiguredEngine());
    await vm.initialize();
    expect(vm.expandVariables('[{$requestcontext}]')).toBe('view');
    expect(vm.expandVariables('[{$requestcontext}]', { requestContext: 'edit' })).toBe('edit');
  });

  test.each(DOCUMENTED)('[{$%s}] degrades without its manager', async (name) => {
    const vm = await makeInitializedManager();
    const result = vm.expandVariables(`[{$${name}}]`);
    expect(typeof result).toBe('string');
    expect(result).not.toContain('[Error:');
  });
});
