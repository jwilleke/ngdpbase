/**
 * #1054 — the one implementation of ACL Tier 1.
 *
 * These cases are transcribed from PolicyInformationPoint.checkFrontmatterAccess's actual
 * behaviour, not from what it looked like it did: the refactor is only safe if
 * this helper decides identically, and 32 existing PolicyInformationPoint assertions are
 * the regression net behind it.
 */
import { describe, test, expect } from 'vitest';
import {
  audiencePrincipals, accessPrincipals, audienceExcludes, decideFrontmatterAccess, namesAddonPrincipal, addonAudienceSlugs
} from '../frontmatterAccess.js';

describe('audiencePrincipals / accessPrincipals', () => {
  test('no metadata or no rule states nothing', () => {
    expect(audiencePrincipals(null)).toBeNull();
    expect(audiencePrincipals(undefined)).toBeNull();
    expect(audiencePrincipals({})).toBeNull();
    expect(accessPrincipals({}, 'view')).toBeNull();
  });

  test('access[action] supplies the principals for that action only', () => {
    expect(accessPrincipals({ access: { view: ['editor'] } }, 'view')).toEqual(['editor']);
    expect(accessPrincipals({ access: { edit: ['admin'] } }, 'edit')).toEqual(['admin']);
    // `access: {edit: [admin]}` leaves viewing open — the real shape behind
    // `using-formplugin`, which is publicly readable but admin-only editable.
    expect(accessPrincipals({ access: { edit: ['admin'] } }, 'view')).toBeNull();
  });

  test('an empty list is no rule, not a deny-all', () => {
    // A bare `access:` key parses to an empty/absent value; treating that as
    // "restricted to nobody" would hide public pages.
    expect(audiencePrincipals({ audience: [] })).toBeNull();
    expect(accessPrincipals({ access: { view: [] } }, 'view')).toBeNull();
  });

  test('non-array values are ignored rather than coerced', () => {
    expect(audiencePrincipals({ audience: 'jim' })).toBeNull();
    expect(accessPrincipals({ access: 'view:jim' }, 'view')).toBeNull();
  });
});

describe('audience covers every action; admins are its one exception (#1964, operator 2026-10-23)', () => {
  for (const audience of [['treasurer'], ['addon:phr']]) {
    const md = { audience };
    for (const action of ['view', 'edit', 'delete', 'rename', 'page-read', 'page-edit']) {
      test(`${audience[0]}: someone outside it is refused ${action}`, () => {
        expect(decideFrontmatterAccess(md, ['editor', 'bob'], action, []))
          .toEqual({ decided: true, allowed: false });
      });
      test(`${audience[0]}: an administrator outside it is not refused ${action}`, () => {
        const d = decideFrontmatterAccess(md, ['admin', 'root'], action, [], true);
        expect(d.allowed || !d.decided).toBe(true);
      });
    }
    test(`${audience[0]}: an administrator is allowed to view, by admin-system`, () => {
      expect(decideFrontmatterAccess(md, ['admin', 'root'], 'view', [], true))
        .toEqual({ decided: true, allowed: true, matched: 'admin-system' });
    });
    test(`${audience[0]}: a member is allowed to view, and edit falls through to policy`, () => {
      expect(decideFrontmatterAccess(md, ['treasurer', 'bob'], 'view', ['phr']).allowed).toBe(true);
      expect(decideFrontmatterAccess(md, ['treasurer', 'bob'], 'edit', ['phr']).decided).toBe(false);
    });
  }

  test('access[action] binds administrators too', () => {
    expect(decideFrontmatterAccess({ access: { view: ['editor'] } }, ['admin', 'root'], 'view', [], true))
      .toEqual({ decided: true, allowed: false });
    // An audience the admin passes by the exception does not lift access either.
    expect(decideFrontmatterAccess({ audience: ['treasurer'], access: { edit: ['editor'] } }, ['admin', 'root'], 'edit', [], true))
      .toEqual({ decided: true, allowed: false });
  });

  test('with both, a viewer must pass the audience and then access', () => {
    const md = { audience: ['treasurer'], access: { view: ['editor'] } };
    expect(decideFrontmatterAccess(md, ['editor'], 'view').allowed).toBe(false);
    expect(decideFrontmatterAccess(md, ['treasurer'], 'view').allowed).toBe(false);
    expect(decideFrontmatterAccess(md, ['treasurer', 'editor'], 'view').allowed).toBe(true);
  });

  test('audienceExcludes is true only when an audience names no match', () => {
    expect(audienceExcludes({}, ['bob'])).toBe(false);
    expect(audienceExcludes({ audience: ['bob'] }, ['bob'])).toBe(false);
    expect(audienceExcludes({ audience: ['addon:phr'] }, ['bob'], ['phr'])).toBe(false);
    expect(audienceExcludes({ audience: ['addon:phr'] }, ['bob'], [])).toBe(true);
    expect(audienceExcludes({ audience: ['treasurer'] }, ['admin'])).toBe(true);
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
    // An audience covers every action, so edit needs the add-ons too.
    expect(namesAddonPrincipal({ audience: ['addon:phr'] }, 'edit')).toBe(true);
    expect(namesAddonPrincipal({ access: { edit: ['addon:phr'] } }, 'view')).toBe(false);
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
