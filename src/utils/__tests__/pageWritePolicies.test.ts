/**
 * The #2255 upgrade of a site's stored policies: a stored copy of a shipped
 * role policy loses the page writes it held on every page, keeping any the
 * category policies do not give on general pages only; other policies are
 * reported, never rewritten.
 */
import { migrateStoredPageWritePolicies, pageWritePoliciesToReview } from '../pageWritePolicies';
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
    const stored = [{ id: 'contributor-permissions', name: 'Contributors', effect: 'allow', priority: 70, subjects: role('contributor'), resources: everyPage, actions: ['page-edit', 'page-delete'] }];
    const { policies } = migrateStoredPageWritePolicies(stored);
    expect(policies).toEqual([
      { ...stored[0], actions: [] },
      expect.objectContaining({ id: 'contributor-permissions-page-write', effect: 'allow', priority: 70, subjects: role('contributor'), resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-delete'] })
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
    expect(migrateStoredPageWritePolicies(undefined)).toEqual({ policies: undefined, report: { rewritten: [], review: [] } });
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
