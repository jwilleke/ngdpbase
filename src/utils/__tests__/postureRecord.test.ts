import { flattenPosture, diffPostures, describePostureDiff } from '../postureRecord';
import type { PostureGroup } from '../securityPosture';

/**
 * #1156 / D19 — the posture is recorded at boot and compared against the
 * previous boot.
 *
 * Auditing only UI changes leaves two holes: an app-custom-config.json edited
 * directly on disk emits nothing, and neither does the state an instance
 * started in. Recording at every start closes the second; comparing against
 * the previous start closes the first, because a change made on disk — or
 * while the process was stopped — shows up as a difference between two
 * consecutive boots even though nothing observed the edit.
 */
const groups = (items: Array<[string, unknown, boolean?]>): PostureGroup[] => [
  {
    group: 'Test',
    items: items.map(([key, value, secret]) => ({
      key, value, restart: false, secret: secret === true
    }))
  }
];

describe('#1156 — flattenPosture', () => {
  test('flattens groups to key/value for recording', () => {
    expect(flattenPosture(groups([['a', 1], ['b', true]]))).toEqual({ a: 1, b: true });
  });

  test('a secret records that it is set, never its value', () => {
    // D15/D19: an entry naming a key and its value would reintroduce the
    // disclosure ngdpbase.config.secret-keys exists to prevent, by another
    // route and into a file with longer retention.
    const flat = flattenPosture(groups([['ngdpbase.session.secret', undefined, true]]));
    expect(flat['ngdpbase.session.secret']).toBe('[secret]');
    expect(JSON.stringify(flat)).not.toContain('undefined');
  });
});

describe('#1156 — diffPostures', () => {
  test('no previous record is UNKNOWN, not "no change"', () => {
    // Only the last 1000 log lines are loaded for search, so on a busy
    // instance the previous boot's record can fall outside the window.
    // Reporting that as "nothing changed" would be a false all-clear.
    const d = diffPostures(null, { a: 1 });
    expect(d.comparable).toBe(false);
    expect(d.changed).toEqual([]);
  });

  test('an identical posture reports no differences', () => {
    const d = diffPostures({ a: 1, b: 2 }, { a: 1, b: 2 });
    expect(d.comparable).toBe(true);
    expect(d.changed).toEqual([]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  test('a value changed between boots is reported with both values', () => {
    // The case the whole decision exists for: somebody edited the file and
    // restarted, and nothing observed the edit.
    const d = diffPostures({ 'ngdpbase.session.secure': true }, { 'ngdpbase.session.secure': false });
    expect(d.changed).toEqual([{ key: 'ngdpbase.session.secure', from: true, to: false }]);
  });

  test('an ingredient added to the view is reported separately from a value change', () => {
    // D19: adding or removing an ingredient changes no value. Recording both
    // as "posture changed" loses the distinction that matters on read-back.
    const d = diffPostures({ a: 1 }, { a: 1, b: 2 });
    expect(d.added).toEqual(['b']);
    expect(d.changed).toEqual([]);
  });

  test('an ingredient removed from the view is reported as removed', () => {
    const d = diffPostures({ a: 1, b: 2 }, { a: 1 });
    expect(d.removed).toEqual(['b']);
    expect(d.changed).toEqual([]);
  });

  test('a secret that stayed a secret is not a change', () => {
    // Both boots record '[secret]', so a rotated secret is invisible here —
    // which is correct: the value must not be recorded, so its change cannot
    // be. config-change covers the act of setting it.
    const d = diffPostures({ s: '[secret]' }, { s: '[secret]' });
    expect(d.changed).toEqual([]);
  });

  test('objects and arrays compare by value, not by identity', () => {
    const d = diffPostures({ r: ['10.0.0.0/8'] }, { r: ['10.0.0.0/8'] });
    expect(d.changed).toEqual([]);
    const d2 = diffPostures({ r: ['10.0.0.0/8'] }, { r: ['0.0.0.0/0'] });
    expect(d2.changed).toHaveLength(1);
  });
});

describe('#1156 — describePostureDiff', () => {
  test('says plainly when nothing can be compared', () => {
    expect(describePostureDiff(diffPostures(null, { a: 1 }))).toMatch(/no previous/i);
  });

  test('says plainly when nothing changed', () => {
    expect(describePostureDiff(diffPostures({ a: 1 }, { a: 1 }))).toMatch(/unchanged/i);
  });

  test('names each changed key and both values', () => {
    const text = describePostureDiff(diffPostures({ 'k.a': true }, { 'k.a': false }));
    expect(text).toContain('k.a');
    expect(text).toContain('true');
    expect(text).toContain('false');
  });

  test('a change found at boot says nothing observed the edit', () => {
    // The operator needs to know WHY this is being reported at startup rather
    // than as a config-change: because nothing saw it happen.
    const text = describePostureDiff(diffPostures({ 'k.a': true }, { 'k.a': false }));
    expect(text).toMatch(/outside the application|not observed|while the instance was not running/i);
  });

  test('a changed map names the keys that changed, not both maps (#1204)', () => {
    const before = { 'ngdpbase.audit.events': { 'page-delete': { tier: 'critical' }, 'page-edit': { tier: 'standard' } } };
    const after = { 'ngdpbase.audit.events': { 'page-delete': { tier: 'standard' }, 'page-edit': { tier: 'standard' }, 'user-create': { tier: 'standard' } } };
    const text = describePostureDiff(diffPostures(before, after));
    expect(text).toContain('page-delete: {"tier":"critical"} → {"tier":"standard"}');
    expect(text).toContain('+user-create');
    expect(text).not.toContain('page-edit');
  });
});
