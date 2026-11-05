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
});
