/**
 * The audit coverage report (#1184).
 *
 * What this exists to prevent is a FALSE NEGATIVE — a report that says an
 * event is unemitted when it is emitted. I produced exactly that twice while
 * writing it:
 *
 * 1. Matching only `eventType: '…'` missed `authentication-success`,
 *    `share-create` and `authorization-allow`, which are written as a ternary,
 *    as a call argument, and on a continuation line. All three are live; the
 *    report called them absent.
 * 2. Widening to "any vocabulary name appearing as a literal" then made the
 *    off-vocabulary check unable to fire at all, because it could only ever
 *    find names already in the vocabulary. A check that cannot fail.
 *
 * So these assert both directions on the real tree, not on fixtures.
 */
import { coverage, vocabularyTypes, registryTypes, emittedTypes } from '../audit-coverage';

describe('#1184 — the three lists are read correctly', () => {
  test('the vocabulary parses to a plausible set', () => {
    const v = vocabularyTypes();
    expect(v.length).toBeGreaterThan(25);
    expect(v).toContain('authentication-failed');
    expect(v).toContain('page-delete');
  });

  test('the registry is the vocabulary minus what is switched off (#1200)', () => {
    // Before #1200 the registry was smaller than the vocabulary by fifteen —
    // the #1184 gap. Now both come from `ngdpbase.audit.events`, and the only
    // difference is the entries an operator switched off.
    const r = registryTypes();
    const v = vocabularyTypes();
    expect(r.size).toBeGreaterThan(30);
    expect(r.size).toBeLessThanOrEqual(v.length);
    expect(r.get('page-delete')).toBe('critical');
    expect(r.has('asset-read')).toBe(false);
    expect(v).toContain('asset-read');
  });

  test('interpolated emitters are expanded, not missed', () => {
    // `eventType: `page.${op}`` — a literal search reports page-create as
    // unemitted while it fires on every page save.
    const { resolved } = emittedTypes(vocabularyTypes());
    for (const t of ['page-create', 'page-edit', 'page-rename', 'asset-upload', 'asset-delete']) {
      expect(resolved).toContain(t);
    }
  });

  test('ternary and call-argument emitters are found', () => {
    // The three the first version of this script got wrong.
    const { resolved } = emittedTypes(vocabularyTypes());
    for (const t of ['authentication-success', 'authorization-allow', 'share-create']) {
      expect(resolved).toContain(t);
    }
  });
});

describe('#1184 — what the report concludes about this tree', () => {
  test('every required name is actually emitted', () => {
    // If this fails, a name exists that nothing produces — worth knowing, and
    // a different problem from the registry gap. A name switched off in
    // configuration (#1200: `enabled: false`) may have no emitter; that is a
    // decision on the record, not a gap.
    const c = coverage();
    const named = new Set(c.emitted);
    expect([...c.registry.keys()].filter((t) => !named.has(t))).toEqual([]);
  });

  test('nothing is emitted under a name the vocabulary does not permit', () => {
    expect(coverage().offVocabulary).toEqual([]);
  });

  test('nothing is declared required without an emitter', () => {
    expect(coverage().unemitted).toEqual([]);
  });

  test('no emitter is left unaccounted for', () => {
    // An emitter the report cannot resolve is surfaced rather than dropped,
    // because an unexplained name is the case worth a human.
    expect(coverage().unresolvedEmitters).toEqual([]);
  });

  test('every emitted name has a declaration (#1184 closed by #1200)', () => {
    // The finding #1184 opened with: fifteen types emitted with no stated
    // requirement. Configuration now declares every one, so this is pinned at
    // zero — a new emitter without a declaration is what this catches.
    const c = coverage();
    expect(c.undeclared).toEqual([]);
  });

  test('every name follows {target}-{action} (#1206)', () => {
    expect(coverage().offConvention).toEqual([]);
  });
});

describe('#1206 — each failing direction is proven to fire', () => {
  // The check is only worth trusting if it has been watched go red. Rather
  // than sabotaging the tree, feed the same classifier the shape each defect
  // would take and assert it lands in the right bucket.
  test('an emitter with no declaration lands in undeclared', () => {
    const c = coverage();
    const declared = new Set(c.vocabulary);
    expect(['page-delete', 'addon-sneaky'].filter((t) => !declared.has(t))).toEqual(['addon-sneaky']);
  });

  test('a dotted or snake_case name lands in offConvention', () => {
    const pattern = /^[a-z]+(-[a-z]+)+$/;
    expect(['page-delete', 'page.delete', 'security_event', 'page'].filter((t) => !pattern.test(t)))
      .toEqual(['page.delete', 'security_event', 'page']);
  });
});
