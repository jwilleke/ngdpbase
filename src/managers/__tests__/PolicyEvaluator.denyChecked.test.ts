/**
 * #2355: an administrator marks an intended deny as checked. The item stays
 * cleared until that rule's content changes. A stored acknowledgement hides the
 * dashboard item and nothing else: it never changes an access decision.
 */
import PolicyEvaluator from '../PolicyEvaluator';
import type { Policy } from '../../types/Policy';
import { CHECKED_DENIES_KEY, policyFingerprint } from '../../utils/pageWritePolicies';
import logger from '../../utils/logger';

const admin = { username: 'ada', roles: ['admin'], isAuthenticated: true };
const editor = { username: 'erin', roles: ['editor'], isAuthenticated: true };

const deny = (id: string, extra: Record<string, unknown> = {}): Policy => ({
  id,
  effect: 'deny',
  subjects: [{ type: 'role', value: 'editor' }],
  resources: [{ type: 'system-category', pattern: 'documentation' }],
  actions: ['page-edit'],
  ...extra
}) as Policy;

/** One evaluator over `policies`, with a configuration that remembers what is saved to it. */
function build(policies: Policy[], stored: Record<string, unknown> = {}) {
  const config: Record<string, unknown> = {
    'ngdpbase.access.resource-types': { page: { attributes: {} }, 'system-category': {} },
    'ngdpbase.access.subject-attributes': {},
    'ngdpbase.access.rule-combining-algorithm': 'deny-overrides',
    ...stored
  };
  const setProperty = vi.fn(async (key: string, value: unknown) => { config[key] = value; });
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d), getUnresolvedProperty: (k: string, d: unknown) => (k in config ? config[k] : d), setProperty };
      if (name === 'PolicyDecisionPoint') return { policies: () => policies, categoriesGranting: () => [] };
      return null;
    }
  } as never;
  return { ev: new PolicyEvaluator(engine), setProperty, config };
}

const itemOf = (ev: PolicyEvaluator): string => {
  const s = ev.getManagerStatus();
  return s.state === 'degraded' ? [s.reason, ...(s.details ?? [])].join(' ') : '';
};
const fingerprintOf = (ev: PolicyEvaluator, id: string): string => {
  const button = ev.getManagerStatus().buttons?.find((b) => b.fields.id === id);
  return button?.fields.fingerprint ?? '';
};

describe('marking a deny as checked (#2355)', () => {
  beforeEach(() => { vi.spyOn(logger, 'warn').mockImplementation(() => logger); });
  afterEach(() => { vi.restoreAllMocks(); });

  test('an unchecked deny is shown, with a button that names it', async () => {
    const { ev } = build([deny('no-docs')]);
    await ev.initialize();
    expect(itemOf(ev)).toContain("The rule 'no-docs' denies access");
    expect(ev.getManagerStatus().buttons).toEqual([
      expect.objectContaining({ label: "Mark 'no-docs' as checked", fields: { id: 'no-docs', fingerprint: policyFingerprint(deny('no-docs')) } })
    ]);
  });

  test('cleared after marking: the item goes without a restart, and the mark is saved with the person who made it', async () => {
    const { ev, setProperty } = build([deny('no-docs')]);
    await ev.initialize();
    const result = await ev.markDenyChecked(admin, 'no-docs', fingerprintOf(ev, 'no-docs'));
    expect(result).toBe('checked');
    expect(setProperty).toHaveBeenCalledWith(CHECKED_DENIES_KEY, { 'no-docs': policyFingerprint(deny('no-docs')) }, admin);
    expect(ev.getManagerStatus().state).toBe('ready');
    expect(itemOf(ev)).toBe('');
  });

  test('stays cleared at the next start while the rule is the same, however its keys are ordered', async () => {
    const stored = { [CHECKED_DENIES_KEY]: { 'no-docs': policyFingerprint(deny('no-docs')) } };
    const reordered = { actions: ['page-edit'], resources: [{ pattern: 'documentation', type: 'system-category' }], subjects: [{ value: 'editor', type: 'role' }], effect: 'deny', id: 'no-docs' } as Policy;
    const { ev } = build([reordered], stored);
    await ev.initialize();
    expect(ev.getManagerStatus().state).toBe('ready');
  });

  test('back when the rule content changes, under the same name', async () => {
    const stored = { [CHECKED_DENIES_KEY]: { 'no-docs': policyFingerprint(deny('no-docs')) } };
    const { ev } = build([deny('no-docs', { actions: ['page-edit', 'page-delete'] })], stored);
    await ev.initialize();
    expect(itemOf(ev)).toContain("The rule 'no-docs' denies access");
  });

  test('a new deny still shows when another is checked', async () => {
    const stored = { [CHECKED_DENIES_KEY]: { 'no-docs': policyFingerprint(deny('no-docs')) } };
    const { ev } = build([deny('no-docs'), deny('no-news', { resources: [{ type: 'system-category', pattern: 'news' }] })], stored);
    await ev.initialize();
    const item = itemOf(ev);
    expect(item).toContain("The rule 'no-news' denies access");
    expect(item).not.toContain("'no-docs'");
    expect(item).toContain('(1 problem)');
  });

  test('a deny with the same content under another name is not checked by the first one\'s mark', async () => {
    const stored = { [CHECKED_DENIES_KEY]: { 'no-docs': policyFingerprint(deny('no-docs')) } };
    const { ev } = build([deny('copy-of-no-docs')], stored);
    await ev.initialize();
    expect(itemOf(ev)).toContain("'copy-of-no-docs'");
  });

  test('other problems stay when the deny is checked', async () => {
    const stored = { [CHECKED_DENIES_KEY]: { 'no-docs': policyFingerprint(deny('no-docs')) } };
    const { ev } = build([deny('no-docs'), deny('old', { priority: 3 })], stored);
    await ev.initialize();
    expect(itemOf(ev)).toContain("'old'");
    expect(itemOf(ev)).not.toContain('denies access');
  });

  test('a mark made on a page that is out of date is refused, and nothing is saved', async () => {
    const { ev, setProperty } = build([deny('no-docs')]);
    await ev.initialize();
    expect(await ev.markDenyChecked(admin, 'no-docs', policyFingerprint(deny('no-docs', { actions: ['page-read'] })))).toBe('changed');
    expect(setProperty).not.toHaveBeenCalled();
    expect(itemOf(ev)).toContain('no-docs');
  });

  test('a rule that is not a deny, or is not there, cannot be marked', async () => {
    const allow = { ...deny('ok'), effect: 'allow' } as Policy;
    const { ev, setProperty } = build([allow]);
    await ev.initialize();
    expect(await ev.markDenyChecked(admin, 'ok', policyFingerprint(allow))).toBe('missing');
    expect(await ev.markDenyChecked(admin, 'nope', 'x')).toBe('missing');
    expect(setProperty).not.toHaveBeenCalled();
  });

  test('a stored mark never changes an access decision', async () => {
    const policies = [deny('no-docs')];
    const ask = async (ev: PolicyEvaluator) => ev.evaluateAccess({ pageName: 'P', action: 'page-edit', resourceType: 'system-category', userContext: editor });
    const before = build(policies);
    await before.ev.initialize();
    const unmarked = await ask(before.ev);
    const after = build(policies, { [CHECKED_DENIES_KEY]: { 'no-docs': policyFingerprint(policies[0]) } });
    await after.ev.initialize();
    expect(await ask(after.ev)).toEqual(unmarked);
    await before.ev.markDenyChecked(admin, 'no-docs', policyFingerprint(policies[0]));
    expect(await ask(before.ev)).toEqual(unmarked);
  });
});
