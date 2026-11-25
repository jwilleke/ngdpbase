/**
 * The start-up warning about open allow rules honours the permissions a permission entry marks read-only,
 * and one line names each permission so marked, so an administrator can spot a mark they did not expect.
 */
import PolicyEvaluator from '../PolicyEvaluator';
import type { Policy } from '../../types/Policy';
import logger from '../../utils/logger';

const rule = (actions: string[]): Policy => ({ id: 'calendar-read-access', effect: 'allow', subjects: [{ type: 'authenticated' }], resources: [{ type: 'page', pattern: '*' }], actions }) as Policy;

function build(policies: Policy[], definitions: Record<string, unknown>) {
  const config: Record<string, unknown> = {
    'ngdpbase.access.resource-types': { page: { attributes: {} }, 'system-category': {} },
    'ngdpbase.access.subject-attributes': {},
    'ngdpbase.access.rule-combining-algorithm': 'deny-overrides',
    'ngdpbase.permissions.definitions': definitions
  };
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d), getUnresolvedProperty: (k: string, d: unknown) => (k in config ? config[k] : d), setProperty: vi.fn() };
      if (name === 'PolicyDecisionPoint') return { policies: () => policies, categoriesGranting: () => [] };
      return null;
    }
  } as never;
  return new PolicyEvaluator(engine);
}

describe('start-up log and read-only permissions', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    info = vi.spyOn(logger, 'info').mockImplementation(() => logger);
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const said = (spy: { mock: { calls: unknown[][] } }): string => spy.mock.calls.map((c) => String(c[0])).join('\n');

  test('a rule that grants only a read-only permission is not warned about', async () => {
    await build([rule(['calendar-read'])], { 'calendar-read': { 'read-only': true } }).initialize();
    expect(said(warn)).not.toContain('calendar-read-access');
  });

  test('without the mark the same rule is warned about, and a write beside the read-only one is too', async () => {
    await build([rule(['calendar-read'])], { 'calendar-read': {} }).initialize();
    expect(said(warn)).toContain("'calendar-read-access' grants calendar-read to every signed-in user");
    warn.mockClear();
    await build([rule(['calendar-read', 'page-edit'])], { 'calendar-read': { 'read-only': true } }).initialize();
    expect(said(warn)).toContain("'calendar-read-access' grants page-edit to every signed-in user");
  });

  test('one plain line names each permission marked read-only', async () => {
    await build([], { 'calendar-read': { 'read-only': true }, 'page-edit': {}, '*': { 'read-only': true } }).initialize();
    const line = said(info).split('\n').find((l) => l.includes('read-only')) ?? '';
    expect(line).toContain('calendar-read');
    expect(line).not.toMatch(/page-edit|\*|#\d|role/);
  });

  test('no permission marked, no line', async () => {
    await build([], { 'calendar-read': {} }).initialize();
    expect(said(info)).not.toContain('read-only');
  });
});
