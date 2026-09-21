/**
 * Legacy ACL markup is scrubbed from page text; escaped examples are kept
 * (#1431 step 8). Moved from the PolicyInformationPoint's tests with the
 * function — it is text handling, not access control.
 */
import { stripAclMarkup } from '../aclMarkup';

describe('stripAclMarkup', () => {
  test('removes [{ALLOW ...}]', () => {
    const out = stripAclMarkup('Content [{ALLOW view admin,editor}] more content');
    expect(out).not.toContain('[{ALLOW');
    expect(out).toContain('Content');
    expect(out).toContain('more content');
  });

  test('removes [{DENY ...}]', () => {
    const out = stripAclMarkup('[{DENY edit anonymous}] page text');
    expect(out).not.toContain('[{DENY');
    expect(out).toContain('page text');
  });

  test('removes %%acl blocks and (:acl :) directives', () => {
    expect(stripAclMarkup('a %%acl view admin %% b')).toBe('a  b');
    expect(stripAclMarkup('a (:acl view admin:) b')).toBe('a  b');
  });

  test('removes several in one pass', () => {
    const out = stripAclMarkup('[{ALLOW view admin}] text [{ALLOW edit admin}] more');
    expect(out).not.toContain('[{ALLOW');
    expect(out).toContain('text');
    expect(out).toContain('more');
  });

  test('leaves text with no markup unchanged', () => {
    const input = 'Just a regular page with no ACL markup here.';
    expect(stripAclMarkup(input)).toBe(input);
  });

  test('empty and non-string input come back as given', () => {
    expect(stripAclMarkup('')).toBe('');
    expect(stripAclMarkup(null)).toBe(null);
  });

  test('an escaped example is prose, and survives editing', () => {
    // A page documenting the syntax writes [[{ALLOW ...}]. The old pattern
    // matched the inner form, so opening the page to edit it left a stray `[`
    // and a save lost the example — the one live page carrying the markup on
    // the instance measured was exactly this.
    const doc = 'Grant it like this: "[[{ALLOW edit Charlie}]". If using a custom';
    expect(stripAclMarkup(doc)).toBe(doc);
  });

  test('a real rule next to an escaped example: the rule goes, the example stays', () => {
    const out = stripAclMarkup('[{ALLOW view All}]\nExample: [[{ALLOW edit Charlie}]');
    expect(out).not.toMatch(/^\[\{ALLOW view All\}\]/);
    expect(out).toContain('[[{ALLOW edit Charlie}]');
  });
});
