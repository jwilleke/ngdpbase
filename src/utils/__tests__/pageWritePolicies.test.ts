/**
 * The #2255 upgrade of a site's stored policies: a stored copy of a shipped
 * role policy loses the page writes it held on every page, keeping any the
 * category policies do not give on general pages only; other policies are
 * reported, never rewritten.
 */
import { migrateStoredPageWritePolicies, pageWritePoliciesToReview, pageWritePolicyFindings, policyFingerprint } from '../pageWritePolicies';
import type { Policy } from '../../types/Policy';

const role = (value: string) => [{ type: 'role', value }];
const everyPage = [{ type: 'page', pattern: '*' }];

describe('migrateStoredPageWritePolicies (#2255)', () => {
  test('a stored editor-permissions loses page-edit, -delete and -rename on every page; its other grants stay', () => {
    const stored = [{ id: 'editor-permissions', effect: 'allow', subjects: role('editor'), resources: everyPage, actions: ['page-read', 'page-edit', 'page-delete', 'page-rename', 'page-create'] }];
    const { policies, report } = migrateStoredPageWritePolicies(stored);
    expect(policies).toEqual([{ ...stored[0], actions: ['page-read', 'page-create'] }]);
    expect(report.rewritten).toHaveLength(1);
    expect(report.rewritten[0]).toMatch(/'editor-permissions'.*page-edit, page-delete, page-rename/);
  });

  test('a write the category policies do not give that role is kept, on general pages only', () => {
    const stored = [{ id: 'contributor-permissions', name: 'Contributors', effect: 'allow', subjects: role('contributor'), resources: everyPage, actions: ['page-edit', 'page-delete'] }];
    const { policies } = migrateStoredPageWritePolicies(stored);
    expect(policies).toEqual([
      { ...stored[0], actions: [] },
      expect.objectContaining({ id: 'contributor-permissions-page-write', effect: 'allow', subjects: role('contributor'), resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-delete'] })
    ]);
  });

  test('anything else is left exactly as stored', () => {
    const stored = [
      { id: 'my-own', effect: 'allow', subjects: role('editor'), resources: everyPage, actions: ['page-edit'] },
      { id: 'editor-permissions', effect: 'allow', subjects: role('editor'), resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-edit'] }
    ];
    const { policies, report } = migrateStoredPageWritePolicies(stored);
    expect(policies).toEqual(stored);
    expect(report.rewritten).toEqual([]);
    expect(migrateStoredPageWritePolicies(undefined)).toEqual({ policies: undefined, report: { rewritten: [], review: [], shown: {} } });
  });
});

describe('pageWritePoliciesToReview (#2255)', () => {
  test('a page write on pages by name to a role other than admin, and every deny, are named', () => {
    const lines = pageWritePoliciesToReview([
      { id: 'my-own', effect: 'allow', subjects: role('editor'), resources: everyPage, actions: ['page-edit'] },
      { id: 'admins', effect: 'allow', subjects: role('admin'), resources: everyPage, actions: ['page-edit'] },
      { id: 'vaults', effect: 'allow', subjects: role('vault-owner'), resources: [{ type: 'vault', pattern: '*' }], actions: ['page-edit'] },
      { id: 'no-docs', effect: 'deny', subjects: role('editor'), resources: [{ type: 'system-category', pattern: 'documentation' }], actions: ['page-read'] }
    ] as Policy[]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/'my-own' grants page-edit .* to editor/);
    expect(lines[1]).toMatch(/'no-docs' is a deny/);
  });

  test('a page write granted to anyone or to authenticated is flagged, saying who can write', () => {
    const lines = pageWritePoliciesToReview([
      { id: 'open-edit', effect: 'allow', subjects: [{ type: 'anyone' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-read', 'page-edit'] },
      { id: 'signed-in-create', effect: 'allow', subjects: [{ type: 'authenticated' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['pushed-pages-edit', 'page-create'] },
      { id: 'read-only', effect: 'allow', subjects: [{ type: 'anyone' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-read'] }
    ] as Policy[]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/'open-edit' grants page-edit to anyone, including signed-out visitors/);
    expect(lines[1]).toMatch(/'signed-in-create' grants pushed-pages-edit, page-create to every signed-in user/);
  });

  test('any non-read allow to anyone or authenticated is flagged, including other page actions and missing actions', () => {
    const base = { effect: 'allow', resources: [{ type: 'page', pattern: '*' }] };
    const lines = pageWritePoliciesToReview([
      { ...base, id: 'raw', subjects: [{ type: 'anyone' }], actions: ['page-raw-edit'] },
      { ...base, id: 'cat', subjects: [{ type: 'authenticated' }], actions: ['page-categorize'] },
      { ...base, id: 'pub', subjects: [{ type: 'anyone' }], actions: ['page-public'] },
      { ...base, id: 'admin', subjects: [{ type: 'authenticated' }], actions: ['admin-config'] },
      { ...base, id: 'missing', subjects: [{ type: 'anyone' }] },
      { ...base, id: 'empty', subjects: [{ type: 'authenticated' }], actions: [] }
    ] as Policy[]);
    expect(lines).toHaveLength(6);
    expect(lines[0]).toMatch(/'raw' grants page-raw-edit to anyone, including signed-out visitors/);
    expect(lines[1]).toMatch(/'cat' grants page-categorize to every signed-in user/);
    expect(lines[4]).toMatch(/'missing' grants \* to anyone/);
    expect(lines[5]).toMatch(/'empty' grants \* to every signed-in user/);
  });

  test('a deny for anyone or authenticated is not flagged as a grant', () => {
    const lines = pageWritePoliciesToReview([
      { id: 'deny-anyone', effect: 'deny', subjects: [{ type: 'anyone' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-edit'] },
      { id: 'deny-signed-in', effect: 'deny', subjects: [{ type: 'authenticated' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-create'] }
    ] as Policy[]);
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l).toMatch(/is a deny/);
    expect(lines.join()).not.toMatch(/signed-out|every signed-in/);
  });
});

describe('the log line keeps its issue number; the plain line has none (#2348)', () => {
  test('the upgrade of a stored policy', () => {
    const stored = [{ id: 'contributor-permissions', effect: 'allow', subjects: role('contributor'), resources: everyPage, actions: ['page-edit', 'page-delete'] }];
    const { report } = migrateStoredPageWritePolicies(stored);
    expect(report.rewritten[0]).toContain('(#2255)');
    const plain = report.shown[report.rewritten[0]];
    expect(plain).toContain("'contributor-permissions'");
    expect(plain).toContain("'contributor-permissions-page-write'");
    expect(plain).toContain('Save the policy list in Admin → Configuration');
    expect(plain).not.toMatch(/#\d|page-(edit|delete|rename)|docs\/|ngdpbase\./);
  });

  test('every review finding', () => {
    const findings = pageWritePolicyFindings([
      { id: 'd', effect: 'deny', subjects: role('editor'), resources: everyPage, actions: ['page-edit'] },
      { id: 'a', effect: 'allow', subjects: [{ type: 'anyone' }], resources: everyPage, actions: ['page-edit'] },
      { id: 'n', effect: 'allow', subjects: role('editor'), resources: everyPage, actions: ['page-edit'] }
    ] as Policy[]);
    expect(findings.map((f) => f.log.match(/#\d+/)?.[0])).toEqual(['#2255', '#2261', '#2255']);
    for (const f of findings) expect(f.plain).not.toMatch(/#\d|page-|system-category|docs\/|ngdpbase\./);
  });
});

describe('the fingerprint of a rule, and denies marked as checked (#2355)', () => {
  const deny = { id: 'no-docs', effect: 'deny', subjects: [{ type: 'role', value: 'editor' }], actions: ['page-edit'] } as never;

  test('it does not depend on the order of keys, and changes with any content', () => {
    const reordered = { actions: ['page-edit'], subjects: [{ value: 'editor', type: 'role' }], effect: 'deny', id: 'no-docs' } as never;
    expect(policyFingerprint(reordered)).toBe(policyFingerprint(deny));
    expect(policyFingerprint(deny)).toMatch(/^[0-9a-f]{64}$/);
    expect(policyFingerprint({ ...(deny as object), actions: ['page-delete'] })).not.toBe(policyFingerprint(deny));
    expect(policyFingerprint({ ...(deny as object), id: 'other' })).not.toBe(policyFingerprint(deny));
  });

  test('a deny with a matching mark is reported as checked, anything else as open', () => {
    const [open] = pageWritePolicyFindings([deny]);
    expect(open.deny).toEqual({ id: 'no-docs', fingerprint: policyFingerprint(deny), checked: false });
    const [done] = pageWritePolicyFindings([deny], { 'no-docs': policyFingerprint(deny) });
    expect(done.deny?.checked).toBe(true);
    const [changed] = pageWritePolicyFindings([deny], { 'no-docs': 'old' });
    expect(changed.deny?.checked).toBe(false);
  });
});
