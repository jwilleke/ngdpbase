/**
 * #1061 — the conflict page must not quietly eat part of the user's edit.
 *
 * When a save is refused as stale, the whole submission is re-posted so the
 * user can merge and save again. If this helper drops a field, the user's
 * second save silently loses whatever it dropped — a title change, a category,
 * half their keywords — and the fix for one data-loss bug becomes another one.
 *
 * That failure is invisible in a browser: the page renders, the save succeeds,
 * and the missing metadata looks like something the user forgot to set.
 */

import { describe, test, expect } from 'vitest';
import WikiRoutes from '../WikiRoutes';

const build = (body: Record<string, unknown>) => WikiRoutes.buildConflictResubmitFields(body);
const nameOf = (fields: Array<{ name: string }>) => fields.map((f) => f.name);
const valueOf = (fields: Array<{ name: string; value: unknown }>, name: string) =>
  fields.find((f) => f.name === name)?.value;

describe('#1061 — every submitted field survives the round trip', () => {
  test('ordinary scalar fields are preserved', () => {
    const fields = build({
      title: 'My Page',
      'system-category': 'documentation',
      status: 'draft'
    });

    expect(nameOf(fields).sort()).toEqual(['status', 'system-category', 'title']);
    expect(valueOf(fields, 'title')).toBe('My Page');
  });

  test('a repeated field keeps ALL its values', () => {
    // Collapsing to the first value would drop every keyword but one, and the
    // user would have no way to tell it happened.
    const fields = build({ userKeywords: ['alpha', 'beta', 'gamma'] });

    expect(valueOf(fields, 'userKeywords')).toEqual(['alpha', 'beta', 'gamma']);
  });

  test('an array of one is still an array, not flattened to a scalar', () => {
    expect(valueOf(build({ userKeywords: ['solo'] }), 'userKeywords')).toEqual(['solo']);
  });

  test('numbers and booleans survive as strings, since that is what a form posts', () => {
    const fields = build({ section: 3, private: true });

    expect(valueOf(fields, 'section')).toBe('3');
    expect(valueOf(fields, 'private')).toBe('true');
  });
});

describe('#1061 — three fields are dropped on purpose', () => {
  test('_csrf is dropped — the conflict page issues the session token itself', () => {
    expect(nameOf(build({ _csrf: 'stale-token', title: 'x' }))).not.toContain('_csrf');
  });

  test('baseLastModified is dropped — re-posting the stale one would conflict forever', () => {
    // This is the one that makes the page usable at all. Carrying the original
    // base token through would make every resubmit fail the same check, with no
    // way out except discarding the edit.
    const fields = build({ baseLastModified: '2026-04-21T15:14:34.355Z', title: 'x' });

    expect(nameOf(fields)).not.toContain('baseLastModified');
  });

  test('content is dropped — it is rendered as the editable textarea', () => {
    // Emitting it as a hidden input too would post the field twice, and express
    // would hand the route an array where it expects a string.
    expect(nameOf(build({ content: 'my text', title: 'x' }))).not.toContain('content');
  });
});

describe('#1061 — nothing unrenderable reaches the template', () => {
  test('an object value is skipped rather than stringified to [object Object]', () => {
    const fields = build({ nested: { a: 1 }, title: 'x' });

    expect(nameOf(fields)).toEqual(['title']);
  });

  test('null and undefined are skipped', () => {
    expect(nameOf(build({ a: null, b: undefined, title: 'x' }))).toEqual(['title']);
  });

  test.each([
    ['undefined body', undefined],
    ['empty body', {}]
  ])('%s yields no fields rather than throwing', (_label, body) => {
    expect(build(body as never)).toEqual([]);
  });
});
