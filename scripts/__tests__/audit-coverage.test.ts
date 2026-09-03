/**
 * The audit coverage report (#1184).
 *
 * What this exists to prevent is a FALSE NEGATIVE — a report that says an
 * event is unemitted when it is emitted. I produced exactly that twice while
 * writing it:
 *
 * 1. Matching only `eventType: '…'` missed `authentication.success`,
 *    `share.create` and `authorization.allow`, which are written as a ternary,
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
    expect(v).toContain('authentication.failed');
    expect(v).toContain('page.delete');
  });

  test('the registry parses, and is SMALLER than the vocabulary', () => {
    // The gap this report exists to show. If these ever match, #1184 is done
    // and this expectation should be updated deliberately rather than deleted.
    const r = registryTypes();
    expect(r.size).toBeGreaterThan(10);
    expect(r.size).toBeLessThan(vocabularyTypes().length);
    expect(r.get('page.delete')).toBe('critical');
  });

  test('interpolated emitters are expanded, not missed', () => {
    // `eventType: `page.${op}`` — a literal search reports page.create as
    // unemitted while it fires on every page save.
    const { resolved } = emittedTypes(vocabularyTypes());
    for (const t of ['page.create', 'page.edit', 'page.rename', 'attachment.upload', 'attachment.delete']) {
      expect(resolved).toContain(t);
    }
  });

  test('ternary and call-argument emitters are found', () => {
    // The three the first version of this script got wrong.
    const { resolved } = emittedTypes(vocabularyTypes());
    for (const t of ['authentication.success', 'authorization.allow', 'share.create']) {
      expect(resolved).toContain(t);
    }
  });
});

describe('#1184 — what the report concludes about this tree', () => {
  test('every vocabulary name is actually emitted', () => {
    // If this fails, a name exists that nothing produces — worth knowing, and
    // a different problem from the registry gap.
    const c = coverage();
    const named = new Set(c.emitted);
    expect(c.vocabulary.filter((t) => !named.has(t))).toEqual([]);
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

  test('the registry gap is real and reported, not zero', () => {
    // The finding itself. Fifteen types are emitted with no stated
    // requirement, so isCriticalEventType() answers false by absence.
    // When #1184 closes this, the assertion below should go to 0 as a
    // deliberate edit — which is the point of pinning it.
    const c = coverage();
    expect(c.undeclared.length).toBeGreaterThan(0);
    expect(c.undeclared).toContain('authentication.failed');
  });
});
