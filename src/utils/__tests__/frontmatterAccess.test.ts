/**
 * #1054 — the one implementation of ACL Tier 1.
 *
 * These cases are transcribed from ACLManager.checkFrontmatterAccess's actual
 * behaviour, not from what it looked like it did: the refactor is only safe if
 * this helper decides identically, and 32 existing ACLManager assertions are
 * the regression net behind it.
 */
import { describe, test, expect } from 'vitest';
import { resolveFrontmatterPrincipals, decideFrontmatterAccess } from '../frontmatterAccess.js';

describe('resolveFrontmatterPrincipals', () => {
  test('no metadata or no rule falls through', () => {
    expect(resolveFrontmatterPrincipals(null, 'view')).toBeNull();
    expect(resolveFrontmatterPrincipals(undefined, 'view')).toBeNull();
    expect(resolveFrontmatterPrincipals({}, 'view')).toBeNull();
  });

  test('access[action] supplies the principals', () => {
    expect(resolveFrontmatterPrincipals({ access: { view: ['editor'] } }, 'view')).toEqual(['editor']);
    expect(resolveFrontmatterPrincipals({ access: { edit: ['admin'] } }, 'edit')).toEqual(['admin']);
  });

  test('an access rule for a DIFFERENT action does not restrict this one', () => {
    // `access: {edit: [admin]}` leaves viewing open — the real shape behind
    // `using-formplugin`, which is publicly readable but admin-only editable.
    expect(resolveFrontmatterPrincipals({ access: { edit: ['admin'] } }, 'view')).toBeNull();
  });

  test('audience is the shorthand for access.view, and view only', () => {
    expect(resolveFrontmatterPrincipals({ audience: ['jim'] }, 'view')).toEqual(['jim']);
    expect(resolveFrontmatterPrincipals({ audience: ['jim'] }, 'edit')).toBeNull();
  });

  test('access.view wins over audience', () => {
    expect(resolveFrontmatterPrincipals(
      { access: { view: ['editor'] }, audience: ['jim'] }, 'view'
    )).toEqual(['editor']);
  });

  test('an empty list is no rule, not a deny-all', () => {
    // A bare `access:` key parses to an empty/absent value; treating that as
    // "restricted to nobody" would hide public pages.
    expect(resolveFrontmatterPrincipals({ audience: [] }, 'view')).toBeNull();
    expect(resolveFrontmatterPrincipals({ access: { view: [] } }, 'view')).toBeNull();
  });

  test('non-array values are ignored rather than coerced', () => {
    expect(resolveFrontmatterPrincipals({ audience: 'jim' }, 'view')).toBeNull();
    expect(resolveFrontmatterPrincipals({ access: 'view:jim' }, 'view')).toBeNull();
  });
});

describe('decideFrontmatterAccess', () => {
  test('undecided when the page states no rule', () => {
    expect(decideFrontmatterAccess({}, ['anonymous'], 'view'))
      .toEqual({ decided: false, allowed: false });
  });

  test('allows a viewer matching by role', () => {
    expect(decideFrontmatterAccess({ audience: ['editor'] }, ['editor', 'alice'], 'view'))
      .toEqual({ decided: true, allowed: true, matched: 'editor' });
  });

  test('allows a viewer matching by username', () => {
    // ACLManager checks `userRoles.includes(p) || username === p`; a flat
    // principal list of [...roles, username] is the same test.
    expect(decideFrontmatterAccess({ audience: ['jim'] }, ['reader', 'jim'], 'view').allowed).toBe(true);
  });

  test('DENIES when a rule exists and nothing matches — the #1054 case', () => {
    // Recent Changes previously treated this as "show it".
    expect(decideFrontmatterAccess({ audience: ['jim'] }, ['anonymous'], 'view'))
      .toEqual({ decided: true, allowed: false });
  });

  test('denies an empty viewer principal list against a real rule', () => {
    expect(decideFrontmatterAccess({ audience: ['jim'] }, [], 'view').allowed).toBe(false);
  });

  test('a page with only an edit rule is undecided for view', () => {
    expect(decideFrontmatterAccess({ access: { edit: ['admin'] } }, ['anonymous'], 'view').decided)
      .toBe(false);
  });
});
