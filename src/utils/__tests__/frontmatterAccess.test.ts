/**
 * #1054 — the one implementation of ACL Tier 1.
 *
 * These cases are transcribed from PolicyInformationPoint.checkFrontmatterAccess's actual
 * behaviour, not from what it looked like it did: the refactor is only safe if
 * this helper decides identically, and 32 existing PolicyInformationPoint assertions are
 * the regression net behind it.
 */
import { describe, test, expect } from 'vitest';
import { resolveFrontmatterPrincipals, decideFrontmatterAccess, namesAddonPrincipal, addonAudienceSlugs } from '../frontmatterAccess.js';

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
    // PolicyInformationPoint checks `userRoles.includes(p) || username === p`; a flat
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

describe('the audience entry addon:<slug> (#1964)', () => {
  test('matches a viewer who turned the add-on on, and only them', () => {
    const md = { audience: ['addon:phr'] };
    expect(decideFrontmatterAccess(md, ['reader', 'bob'], 'view', ['phr']))
      .toEqual({ decided: true, allowed: true, matched: 'addon:phr' });
    expect(decideFrontmatterAccess(md, ['reader', 'bob'], 'view', ['journal']))
      .toEqual({ decided: true, allowed: false });
    expect(decideFrontmatterAccess(md, ['reader', 'bob'], 'view'))
      .toEqual({ decided: true, allowed: false });
  });

  test('a role or username spelled addon:<slug> never matches it', () => {
    // The add-on entry is matched only against the enabled add-ons, so a
    // principal list that happens to hold the string does not count.
    expect(decideFrontmatterAccess({ audience: ['addon:phr'] }, ['addon:phr'], 'view', []))
      .toEqual({ decided: true, allowed: false });
  });

  test('an enabled add-on never matches a plain entry of the same name', () => {
    expect(decideFrontmatterAccess({ audience: ['phr'] }, ['reader'], 'view', ['phr']))
      .toEqual({ decided: true, allowed: false });
  });

  test('combines with other entries: any one matching allows', () => {
    const md = { audience: ['addon:phr', 'admin'] };
    expect(decideFrontmatterAccess(md, ['admin', 'root'], 'view', []).allowed).toBe(true);
    expect(decideFrontmatterAccess(md, ['reader', 'bob'], 'view', ['phr']).allowed).toBe(true);
    expect(decideFrontmatterAccess(md, ['reader', 'bob'], 'view', []).allowed).toBe(false);
  });

  test('works in access[action] as in audience', () => {
    const md = { access: { edit: ['addon:phr'] } };
    expect(decideFrontmatterAccess(md, ['editor'], 'edit', ['phr']).allowed).toBe(true);
    expect(decideFrontmatterAccess(md, ['editor'], 'edit', []).allowed).toBe(false);
  });

  test('an empty slug names nothing and matches nobody', () => {
    expect(decideFrontmatterAccess({ audience: ['addon:'] }, ['reader'], 'view', ['']))
      .toEqual({ decided: true, allowed: false });
  });

  test('namesAddonPrincipal says whether deciding needs the viewer\'s add-ons', () => {
    expect(namesAddonPrincipal({ audience: ['addon:phr'] }, 'view')).toBe(true);
    expect(namesAddonPrincipal({ audience: ['addon:phr'] }, 'edit')).toBe(false);
    expect(namesAddonPrincipal({ audience: ['admin'] }, 'view')).toBe(false);
    expect(namesAddonPrincipal({}, 'view')).toBe(false);
    expect(namesAddonPrincipal(null, 'view')).toBe(false);
  });

  test('addonAudienceSlugs lists every add-on the page names, in audience and access', () => {
    expect(addonAudienceSlugs({ audience: ['addon:phr', 'admin'], access: { edit: ['addon:journal', 'addon:phr'] } }))
      .toEqual(['phr', 'journal']);
    expect(addonAudienceSlugs({ audience: ['admin'] })).toEqual([]);
    expect(addonAudienceSlugs({ audience: ['addon:'] })).toEqual(['']);
    expect(addonAudienceSlugs(null)).toEqual([]);
  });
});
