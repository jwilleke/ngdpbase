/**
 * The #2255 upgrade of a site's stored policies: a stored copy of a shipped
 * role policy loses the page writes it held on every page, keeping any the
 * category policies do not give on general pages only; other policies are
 * reported, never rewritten.
 */
import { migrateStoredPageWritePolicies, narrowedRoleWrites, withoutNarrowedWrites, readNarrowedWrites, restoreNarrowedWrites, clip, pageWritePoliciesToReview, pageWritePolicyFindings, policyFingerprint } from '../pageWritePolicies';
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

describe('narrowedRoleWrites: page writes a site removed from a stored shipped role policy (#2270)', () => {
  const editorAll = ['page-read', 'page-edit', 'page-delete', 'page-rename'];
  const stored = (id: string, roleName: string, actions?: string[], extra: Record<string, unknown> = {}) =>
    ({ id, effect: 'allow', subjects: role(roleName), resources: everyPage, ...(actions ? { actions } : {}), ...extra });

  test('a copy holding every write the shipped policy had is not narrowed', () => {
    expect(narrowedRoleWrites([stored('editor-permissions', 'editor', editorAll), stored('contributor-permissions', 'contributor', ['page-edit']), stored('demo-admin-access', 'demo-admin', ['page-edit'])])).toEqual([]);
  });

  test('each write the shipped policy had and the copy lacks is named, with its role and policy', () => {
    expect(narrowedRoleWrites([stored('editor-permissions', 'editor', ['page-read', 'page-edit']), stored('contributor-permissions', 'contributor', ['page-read']), stored('demo-admin-access', 'demo-admin', ['page-edit'])])).toEqual([
      { role: 'editor', action: 'page-delete', policyId: 'editor-permissions' },
      { role: 'editor', action: 'page-rename', policyId: 'editor-permissions' },
      { role: 'contributor', action: 'page-edit', policyId: 'contributor-permissions' }
    ]);
  });

  test('a copy with no actions or a wildcard holds everything; a deny, an absent copy and a non-list are not narrowing', () => {
    expect(narrowedRoleWrites([stored('editor-permissions', 'editor'), stored('contributor-permissions', 'contributor', ['*'])])).toEqual([]);
    expect(narrowedRoleWrites([stored('editor-permissions', 'editor', [], { effect: 'deny' })])).toEqual([]);
    expect(narrowedRoleWrites([stored('my-own', 'editor', ['page-read'])])).toEqual([]);
    expect(narrowedRoleWrites(undefined)).toEqual([]);
    expect(narrowedRoleWrites('editor-permissions')).toEqual([]);
  });

  test('a copy whose resources are no longer every page is left to the site: it is reported elsewhere, not read as narrowed', () => {
    expect(narrowedRoleWrites([stored('editor-permissions', 'editor', ['page-read'], { resources: [{ type: 'page', pattern: 'Notes*' }] })])).toEqual([]);
  });

  test('a list in which no shipped role copy holds a write on every page was already through the #2255 migration, so what it lacks says nothing about the site', () => {
    expect(narrowedRoleWrites([stored('editor-permissions', 'editor', ['page-read']), stored('contributor-permissions', 'contributor', ['page-read']), stored('demo-admin-access', 'demo-admin', ['page-read'])])).toEqual([]);
    expect(narrowedRoleWrites([stored('contributor-permissions', 'contributor', ['page-read'])])).toEqual([]);
  });

  test('a copy that still holds a write shows the list is as the site saved it, so another copy lacking its writes is narrowed', () => {
    expect(narrowedRoleWrites([stored('editor-permissions', 'editor', ['page-read']), stored('admin-full-access', 'admin', ['page-edit'])])).toEqual([
      { role: 'editor', action: 'page-edit', policyId: 'editor-permissions' },
      { role: 'editor', action: 'page-delete', policyId: 'editor-permissions' },
      { role: 'editor', action: 'page-rename', policyId: 'editor-permissions' }
    ]);
  });

  test('two copies with one id: the last is the one the merge keeps, so it is the one read', () => {
    const full = stored('editor-permissions', 'editor', editorAll);
    const narrower = stored('editor-permissions', 'editor', ['page-read', 'page-edit']);
    expect(narrowedRoleWrites([full, narrower]).map((n) => n.action)).toEqual(['page-delete', 'page-rename']);
    expect(narrowedRoleWrites([narrower, full])).toEqual([]);
  });

  test('a hand-edited copy with actions or resources that are not lists does not throw', () => {
    expect(() => narrowedRoleWrites([{ id: 'editor-permissions', effect: 'allow', resources: 'page:*', actions: 'page-read' }, { id: 'demo-admin-access', resources: [null], actions: [null] }, null, 7])).not.toThrow();
  });

  test('a list that holds a category policy was saved after #2255, when the role policies hold no page writes by design', () => {
    expect(narrowedRoleWrites([stored('editor-permissions', 'editor', ['page-read']), { id: 'general-page-write', effect: 'allow', subjects: role('editor'), actions: ['page-edit'] }])).toEqual([]);
  });
});

describe('withoutNarrowedWrites: the category policies leave out what the site removed (#2270)', () => {
  const category = (extra: Record<string, unknown>) => ({ effect: 'allow', resources: [{ type: 'system-category', pattern: 'general' }], ...extra });
  const narrowed = [
    { role: 'editor', action: 'page-delete', policyId: 'editor-permissions' },
    { role: 'editor', action: 'page-rename', policyId: 'editor-permissions' }
  ];
  const write = category({ id: 'general-page-write', subjects: [...role('admin'), ...role('editor')], actions: ['page-edit', 'page-delete', 'page-rename'] });

  test('a policy naming the role and another is split: the other keeps all, the role keeps what the site kept', () => {
    const { policies, applied } = withoutNarrowedWrites([write], narrowed, new Set());
    expect(policies).toEqual([
      { ...write, subjects: role('admin') },
      { ...write, id: 'general-page-write-editor', subjects: role('editor'), actions: ['page-edit'] }
    ]);
    expect(applied).toEqual([
      { role: 'editor', action: 'page-delete', policyId: 'editor-permissions', from: ['general-page-write'] },
      { role: 'editor', action: 'page-rename', policyId: 'editor-permissions', from: ['general-page-write'] }
    ]);
  });

  test('a policy that grants the role only what the site removed is dropped for it, and its condition travels with a split', () => {
    const condition = { 'string-equal': [{ attributeid: 'resource:owner', datatype: 'string' }, { attributeid: 'subject:id', datatype: 'string' }] };
    const own = category({ id: 'self-managed-author-write', subjects: role('editor'), actions: ['page-delete', 'page-rename'], condition });
    expect(withoutNarrowedWrites([own], narrowed, new Set()).policies).toEqual([]);
    const withEdit = { ...own, actions: ['page-edit', 'page-delete'] };
    expect(withoutNarrowedWrites([withEdit], narrowed, new Set()).policies).toEqual([{ ...withEdit, id: 'self-managed-author-write-editor', actions: ['page-edit'] }]);
  });

  test('an add-on\'s category policy is read the same way', () => {
    const journal = category({ id: 'journal-self-managed-author-write', subjects: role('editor'), resources: [{ type: 'system-category', pattern: 'journal' }], actions: ['page-edit', 'page-delete', 'page-rename'] });
    expect(withoutNarrowedWrites([journal], narrowed, new Set()).applied.map((a) => a.from)).toEqual([['journal-self-managed-author-write'], ['journal-self-managed-author-write']]);
  });

  test('a policy the site stores itself, a deny, a policy on pages by name, other roles and other actions are left as they are', () => {
    const list = [
      write,
      category({ id: 'mine', subjects: role('editor'), actions: ['page-delete'] }),
      category({ id: 'no-delete', effect: 'deny', subjects: role('editor'), actions: ['page-delete'] }),
      { id: 'by-name', effect: 'allow', subjects: role('editor'), resources: everyPage, actions: ['page-delete'] },
      category({ id: 'other-role', subjects: role('contributor'), actions: ['page-delete'] }),
      category({ id: 'pushed', subjects: role('editor'), actions: ['pushed-pages-delete', 'page-create'] })
    ];
    const { policies } = withoutNarrowedWrites(list, narrowed, new Set(['general-page-write', 'mine']));
    expect(policies).toEqual(list);
  });

  test('the id given to a split is one nothing else in the list has', () => {
    const taken = category({ id: 'general-page-write-editor', subjects: role('editor'), actions: ['page-read'] });
    const ids = (withoutNarrowedWrites([write, taken], narrowed, new Set(['general-page-write-editor'])).policies as Array<{ id: string }>).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('general-page-write-editor');
    expect(ids).toHaveLength(3);
  });

  test('a policy with resources, subjects or actions that are not lists is left as it is and does not throw', () => {
    const bad = [{ id: 'x', effect: 'allow', resources: 'system-category', subjects: 'editor', actions: 'page-delete' }, { id: 'y', effect: 'allow', resources: [null], subjects: [null], actions: [null] }, null, 'z'];
    expect(() => withoutNarrowedWrites([...bad, write], narrowed, new Set())).not.toThrow();
    expect((withoutNarrowedWrites([...bad, write], narrowed, new Set()).policies as unknown[]).slice(0, 4)).toEqual(bad);
  });

  test('nothing narrowed, or no list, changes nothing', () => {
    expect(withoutNarrowedWrites([write], [], new Set())).toEqual({ policies: [write], applied: [] });
    expect(withoutNarrowedWrites(undefined, narrowed, new Set())).toEqual({ policies: undefined, applied: [] });
  });
});

describe('readNarrowedWrites: what a hand-edited record says, and what is skipped and why (#2270 re-review)', () => {
  test('a good list is read whole and nothing is skipped', () => {
    const { pairs, skipped } = readNarrowedWrites([{ role: 'editor', action: 'page-delete' }, { role: 'contributor', action: 'page-edit' }]);
    expect(pairs.map((p) => `${p.role}/${p.action}`)).toEqual(['editor/page-delete', 'contributor/page-edit']);
    expect(skipped).toEqual([]);
  });

  test('no value and an empty list are fine: nothing was narrowed', () => {
    expect(readNarrowedWrites(undefined)).toEqual({ pairs: [], skipped: [] });
    expect(readNarrowedWrites([])).toEqual({ pairs: [], skipped: [] });
  });

  test.each([
    ['a string', 'editor:page-delete'],
    ['an object, not a list', {}],
    ['a number', 7],
    ['null', null]
  ])('%s is one skipped value that says what a list looks like', (_name, value) => {
    const { pairs, skipped } = readNarrowedWrites(value);
    expect(pairs).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatch(/list/);
    expect(skipped[0]).toContain('"role": "editor"');
  });

  test('each entry that cannot be read is skipped with its own reason, and the rest still count', () => {
    const { pairs, skipped } = readNarrowedWrites([
      { role: 'editor', action: 'page-delete' },
      { role: 'Editor', action: 'page-delete' },
      { role: 'editor', action: 'page-delet' },
      { role: 'contributor', action: 'page-delete' },
      null,
      1,
      'x',
      { role: 'editor' }
    ]);
    expect(pairs.map((p) => `${p.role}/${p.action}`)).toEqual(['editor/page-delete']);
    expect(skipped).toHaveLength(7);
    expect(skipped[0]).toMatch(/entry 2.*'Editor'.*editor, contributor or demo-admin.*lower case/);
    expect(skipped[1]).toMatch(/entry 3.*'page-delet'.*page-edit, page-delete or page-rename/);
    expect(skipped[2]).toMatch(/entry 4.*contributor.*page-delete.*page-edit/);
    expect(skipped.join(' ')).not.toMatch(/#\d/);
  });

  test('a pair named twice is not a problem', () => {
    expect(readNarrowedWrites([{ role: 'editor', action: 'page-delete' }, { role: 'editor', action: 'page-delete' }]).skipped).toEqual([]);
  });

  test('a long value in a bad entry is cut short in the message', () => {
    const { skipped } = readNarrowedWrites([{ role: 'x'.repeat(500), action: 'page-delete' }]);
    expect(skipped[0].length).toBeLessThan(400);
  });
});

describe('restoreNarrowedWrites: the stored list holds the site\'s own changes, never the effects of the narrowing (#2270 re-review)', () => {
  const category = (extra: Record<string, unknown>) => ({ effect: 'allow', resources: [{ type: 'system-category', pattern: 'general' }], ...extra });
  const narrowed = [
    { role: 'editor', action: 'page-delete', policyId: 'editor-permissions' },
    { role: 'editor', action: 'page-rename', policyId: 'editor-permissions' }
  ];
  const write = category({ id: 'general-page-write', subjects: [...role('admin'), ...role('editor')], actions: ['page-edit', 'page-delete', 'page-rename'] });
  const own = category({ id: 'self-managed-author-write', subjects: role('editor'), actions: ['page-delete', 'page-rename'] });
  const other = category({ id: 'other', subjects: role('contributor'), actions: ['page-edit'] });
  const base = [write, own, other];
  const inForce = () => withoutNarrowedWrites(base, narrowed, new Set()).policies;

  test('the list in force, posted back whole, becomes the list it was made from', () => {
    expect(inForce()).not.toEqual(base);
    expect(restoreNarrowedWrites(inForce(), base, narrowed)).toEqual(base);
  });

  test('a policy narrowing removed whole is put back, so posting the list in force does not delete it', () => {
    expect((inForce() as Array<{ id: string }>).map((p) => p.id)).not.toContain('self-managed-author-write');
    expect((restoreNarrowedWrites(inForce(), base, narrowed) as Array<{ id: string }>).map((p) => p.id)).toContain('self-managed-author-write');
  });

  test('a rule the site adds to the list in force is kept, after what it was made from', () => {
    const mine = category({ id: 'mine', subjects: role('contributor'), actions: ['page-read'] });
    expect(restoreNarrowedWrites([...(inForce() as unknown[]), mine], base, narrowed)).toEqual([...base, mine]);
  });

  test('a rule the site deletes from the list in force stays deleted', () => {
    const without = (inForce() as Array<{ id: string }>).filter((p) => p.id !== 'other');
    expect((restoreNarrowedWrites(without, base, narrowed) as Array<{ id: string }>).map((p) => p.id)).not.toContain('other');
  });

  test('a rule the site edited is stored as edited, once, and not joined by the original', () => {
    const edited = (inForce() as Array<Record<string, unknown>>).map((p) => (p.id === 'general-page-write' ? { ...p, name: 'edited' } : p));
    const out = restoreNarrowedWrites(edited, base, narrowed) as Array<Record<string, unknown>>;
    expect(out.filter((p) => p.id === 'general-page-write')).toHaveLength(1);
    expect(out.find((p) => p.id === 'general-page-write')?.name).toBe('edited');
  });

  test('deleting every piece a rule was split into deletes the rule', () => {
    const without = (inForce() as Array<{ id: string }>).filter((p) => !p.id.startsWith('general-page-write'));
    expect((restoreNarrowedWrites(without, base, narrowed) as Array<{ id: string }>).map((p) => p.id)).not.toContain('general-page-write');
  });

  test('nothing narrowed, or no list, is returned as it is', () => {
    expect(restoreNarrowedWrites(base, base, [])).toBe(base);
    expect(restoreNarrowedWrites(undefined, base, narrowed)).toBeUndefined();
    expect(restoreNarrowedWrites('x', base, narrowed)).toBe('x');
  });
});

describe('restoreNarrowedWrites: a piece is folded back only when it is posted as it was shown, and never takes or gives a write the site did not (#2270 re-review 3)', () => {
  const category = (extra: Record<string, unknown>) => ({ effect: 'allow', resources: [{ type: 'system-category', pattern: 'general' }], ...extra });
  const narrowed = [{ role: 'editor', action: 'page-delete', policyId: 'editor-permissions' }];
  const catWrite = category({ id: 'cat-write', subjects: [...role('admin'), ...role('editor')], actions: ['page-edit', 'page-delete'] });
  const base = [catWrite];
  const inForce = (): Array<Record<string, unknown>> => withoutNarrowedWrites(base, narrowed, new Set()).policies as Array<Record<string, unknown>>;
  const stored = (posted: unknown[]): Array<Record<string, any>> => restoreNarrowedWrites(posted, base, narrowed) as Array<Record<string, any>>;
  const ids = (list: Array<Record<string, any>>): unknown[] => list.map((p) => p.id);
  /** What an editor holds on the rule after the narrowing is applied to what was stored. */
  const editorActions = (list: unknown): string[] =>
    ((withoutNarrowedWrites(list, narrowed, new Set()).policies as Array<Record<string, any>>) ?? [])
      .filter((p) => (p.subjects ?? []).some((s: { value: string }) => s.value === 'editor'))
      .flatMap((p) => p.actions);
  const editorActionsWithoutPairs = (list: unknown): string[] => (list as Array<Record<string, any>>).filter((p) => (p.subjects ?? []).some((s: { value: string }) => s.value === 'editor')).flatMap((p) => p.actions);

  test('the rule is shown as two pieces: the base keeps admin, the editor piece keeps page-edit', () => {
    expect(ids(inForce())).toEqual(['cat-write', 'cat-write-editor']);
  });

  test('the base piece renamed, the editor piece untouched: the editor is folded back onto the edited rule and keeps page-edit', () => {
    const posted = inForce().map((p) => (p.id === 'cat-write' ? { ...p, name: 'renamed' } : p));
    const out = stored(posted);
    expect(ids(out)).toEqual(['cat-write']);
    expect(out[0].name).toBe('renamed');
    expect(JSON.stringify(out[0].subjects)).toContain('editor');
    expect(editorActions(out)).toEqual(['page-edit']);
    expect(editorActionsWithoutPairs(out)).toEqual(['page-edit', 'page-delete']);
  });

  test('a resource added to the base piece, the editor piece untouched: the editor keeps page-edit on the edited rule', () => {
    const posted = inForce().map((p) => (p.id === 'cat-write' ? { ...p, resources: [...(p.resources as unknown[]), { type: 'system-category', pattern: 'user' }] } : p));
    const out = stored(posted);
    expect(ids(out)).toEqual(['cat-write']);
    expect(JSON.stringify(out[0].resources)).toContain('user');
    expect(editorActions(out)).toEqual(['page-edit']);
  });

  test('both pieces posted as shown: the original rule, and nothing else', () => {
    expect(stored(inForce())).toEqual(base);
  });

  test('the editor piece deleted: it stays deleted and the original does not come back', () => {
    const out = stored(inForce().filter((p) => p.id !== 'cat-write-editor'));
    expect(ids(out)).toEqual(['cat-write']);
    expect(JSON.stringify(out[0].subjects)).not.toContain('editor');
    expect(editorActions(out)).toEqual([]);
  });

  test('the editor piece edited down to page-read: it is stored as posted, with no -editor-2 and no original', () => {
    const posted = inForce().map((p) => (p.id === 'cat-write-editor' ? { ...p, actions: ['page-read'] } : p));
    const out = stored(posted);
    expect(out).toEqual(posted);
    expect(ids(out)).toEqual(['cat-write', 'cat-write-editor']);
    expect(editorActions(out)).toEqual(['page-read']);
  });

  test('the base piece deleted, the editor piece untouched: only the editor piece is stored, as posted', () => {
    const out = stored(inForce().filter((p) => p.id !== 'cat-write'));
    expect(out).toEqual(inForce().filter((p) => p.id === 'cat-write-editor'));
  });

  test('the base piece deleted and the editor piece edited: both are as posted', () => {
    const posted = inForce().filter((p) => p.id !== 'cat-write').map((p) => ({ ...p, actions: ['page-read'] }));
    expect(stored(posted)).toEqual(posted);
  });

  test('a rule with only the narrowed role: the piece posted unchanged is the original again', () => {
    const solo = category({ id: 'solo', subjects: role('editor'), actions: ['page-edit', 'page-delete'] });
    const soloBase = [solo];
    const shown = withoutNarrowedWrites(soloBase, narrowed, new Set()).policies as unknown[];
    expect(restoreNarrowedWrites(shown, soloBase, narrowed)).toEqual(soloBase);
  });

  test('two narrowed roles on one rule: one piece edited, the other unchanged, folds only the unchanged one', () => {
    const both = [{ role: 'editor', action: 'page-delete', policyId: 'editor-permissions' }, { role: 'contributor', action: 'page-edit', policyId: 'contributor-permissions' }];
    const rule = category({ id: 'multi', subjects: [...role('admin'), ...role('editor'), ...role('contributor')], actions: ['page-edit', 'page-delete'] });
    const shown = withoutNarrowedWrites([rule], both, new Set()).policies as Array<Record<string, any>>;
    const posted = shown.map((p) => (p.id === 'multi-contributor' ? { ...p, actions: ['page-read'] } : p));
    const out = restoreNarrowedWrites(posted, [rule], both) as Array<Record<string, any>>;
    expect(out.map((p) => p.id)).toEqual(['multi', 'multi-contributor']);
    expect(out[0].subjects.map((s: { value: string }) => s.value)).toEqual(['admin', 'editor']);
    expect(out[1].actions).toEqual(['page-read']);
  });
});

describe('a value from a hand-edited file cannot forge a log line (#2270 re-review 3)', () => {
  test('a newline or control character in a bad pair is replaced in the reason', () => {
    const { skipped } = readNarrowedWrites([{ role: 'edi\ntor\r\u0007', action: 'page-delete' }, { role: 'editor', action: 'page-\u2028delet' }]);
    expect(skipped).toHaveLength(2);
    // eslint-disable-next-line no-control-regex -- the point is that no control character survives
    for (const reason of skipped) expect(reason).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
  });

  test('clip is exported for rule ids and never keeps a line break', () => {
    expect(clip('a\nb\u0000c')).toBe('a b c');
    expect(clip('x'.repeat(100)).length).toBeLessThan(50);
  });
});

describe('restoreNarrowedWrites: a role piece folds onto the base piece only when the base is the original apart from who and how it is named (#2270 re-review 4)', () => {
  const category = (extra: Record<string, unknown>) => ({ effect: 'allow', resources: [{ type: 'system-category', pattern: 'general' }], ...extra });
  const narrowed = [{ role: 'editor', action: 'page-delete', policyId: 'editor-permissions' }];
  const rule = category({ id: 'cat-write', name: 'Writes', description: 'who writes', subjects: [...role('admin'), ...role('editor')], actions: ['page-edit', 'page-delete', 'page-rename'] });
  const base = [rule];
  const shown = (): Array<Record<string, any>> => withoutNarrowedWrites(base, narrowed, new Set()).policies as Array<Record<string, any>>;
  const editBase = (change: Record<string, unknown>): unknown[] => shown().map((p) => (p.id === 'cat-write' ? { ...p, ...change } : p));
  const stored = (posted: unknown[]): Array<Record<string, any>> => restoreNarrowedWrites(posted, base, narrowed) as Array<Record<string, any>>;
  /** What the editor holds on page-delete after a restart narrows what was stored. */
  const editorDeletes = (list: unknown): Array<Record<string, any>> =>
    (withoutNarrowedWrites(list, narrowed, new Set()).policies as Array<Record<string, any>>).filter(
      (p) => p.effect !== 'deny' && (p.subjects ?? []).some((s: { value: string }) => s.value === 'editor') && (p.actions ?? []).includes('page-delete')
    );

  test.each([
    ['a page:* resource', { resources: [{ type: 'system-category', pattern: 'general' }, { type: 'page', pattern: '*' }] }],
    ['the system category', { resources: [{ type: 'system-category', pattern: 'general' }, { type: 'system-category', pattern: 'system' }] }],
    ['page-create', { actions: ['page-edit', 'page-delete', 'page-rename', 'page-create'] }],
    ['a smaller list of actions', { actions: ['page-read'] }]
  ])('%s added to the base piece: the editor piece is stored as shown, not folded in, and the editor gets nothing from the edit', (_name, change) => {
    const posted = editBase(change);
    const out = stored(posted);
    expect(out).toEqual(posted);
    expect(editorDeletes(out)).toEqual([]);
    expect(JSON.stringify(out.find((p) => p.id === 'cat-write')?.subjects)).not.toContain('editor');
  });

  test('the base piece replaced by a deny under the same id: the editor piece is stored as shown', () => {
    const posted = editBase({ effect: 'deny' });
    expect(stored(posted)).toEqual(posted);
  });

  test('a change of name only folds the editor back in', () => {
    const out = stored(editBase({ name: 'Renamed' }));
    expect(out.map((p) => p.id)).toEqual(['cat-write']);
    expect(out[0].name).toBe('Renamed');
    expect(JSON.stringify(out[0].subjects)).toContain('editor');
  });

  test('a change of description only folds the editor back in', () => {
    const out = stored(editBase({ description: 'new words' }));
    expect(out.map((p) => p.id)).toEqual(['cat-write']);
    expect(out[0].description).toBe('new words');
  });

  test('a change of name and description together folds back, and the original comes back when both are put back', () => {
    expect(stored(editBase({ name: 'Writes', description: 'who writes' }))).toEqual(base);
  });

  test('a change of the rule id is not folded: the base is a new rule and the editor piece stays as shown', () => {
    const posted = editBase({ id: 'cat-write-renamed' });
    expect(stored(posted)).toEqual(posted);
  });
});
