/**
 * Tests for #778 Slice 1 — Page-ACL markup → frontmatter migration script.
 *
 * Tests the pure transformFrontmatter() function so we don't need to touch the
 * filesystem. Each case asserts the outcome label and the shape of the
 * resulting frontmatter + body.
 */

import { transformFrontmatter } from '../migrate-page-acl-to-frontmatter';
import matter from 'gray-matter';

function fm(raw: string) {
  return matter(raw).data as Record<string, unknown>;
}

function body(raw: string) {
  return matter(raw).content;
}

describe('transformFrontmatter (#778 Slice 1)', () => {
  test('Pattern A (CSS/theme) — `edit Admin` + `view All` → access.edit set, no audience', () => {
    const raw = [
      '---',
      'title: CSSThemeDark',
      'uuid: u1',
      'lastModified: "2026-01-01T00:00:00Z"',
      '---',
      '[{ALLOW edit Admin}]',
      '[{ALLOW view All}]',
      '',
      'Body content here.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.access).toEqual({ edit: ['Admin'] });
    expect(data.audience).toBeUndefined();
    expect(data.title).toBe('CSSThemeDark');
    expect(data.lastModified).toBe('2026-01-01T00:00:00Z');
    expect(body(result.content).trim()).toBe('Body content here.');
  });

  test('Pattern B (trusted view + author/admin write) — emits audience + access map; markup stripped', () => {
    const raw = [
      '---',
      'title: AdminsPage',
      'uuid: u2',
      '---',
      '[{ALLOW view Trusted}]',
      '[{ALLOW delete jim,Admin}]',
      '[{ALLOW edit jim,Admin}]',
      '',
      '# Admin Only'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.audience).toEqual(['Trusted']);
    expect(data.access).toEqual({ delete: ['jim', 'Admin'], edit: ['jim', 'Admin'] });
    expect(body(result.content).trim()).toBe('# Admin Only');
  });

  test('Pattern C (public view only) — `view All` alone → no audience/access, markup stripped', () => {
    const raw = [
      '---',
      'title: JSPWikiTags',
      'uuid: u3',
      '---',
      '[{ALLOW view All}]',
      '',
      'Public content.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.audience).toBeUndefined();
    expect(data.access).toBeUndefined();
    expect(body(result.content).trim()).toBe('Public content.');
  });

  test('legacy JSPWiki variant with trailing `principal` keyword is tolerated', () => {
    const raw = [
      '---',
      'title: Legacy',
      'uuid: u4',
      '---',
      '[{ALLOW view Trusted principal }]',
      '[{ALLOW delete jim,Admin principal }]',
      '',
      'Legacy.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.audience).toEqual(['Trusted']);
    expect(data.access).toEqual({ delete: ['jim', 'Admin'] });
  });

  test('comma-with-space and trailing-whitespace tolerated; principal order preserved', () => {
    const raw = [
      '---',
      'title: WhitespacePage',
      'uuid: u5',
      '---',
      '[{ALLOW edit jim, Admin}] ',
      '',
      'Body.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.access).toEqual({ edit: ['jim', 'Admin'] });
  });

  test('multiple ALLOW lines for the same action union together (no duplicates)', () => {
    const raw = [
      '---',
      'title: Multi',
      'uuid: u6',
      '---',
      '[{ALLOW edit jim}]',
      '[{ALLOW edit Admin}]',
      '[{ALLOW edit jim,bob}]',
      '',
      'Body.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.access).toEqual({ edit: ['jim', 'Admin', 'bob'] });
  });

  test('no ALLOW markup → outcome `no-markup`, file unchanged', () => {
    const raw = [
      '---',
      'title: Normal',
      'uuid: u7',
      '---',
      '# Just a normal page',
      '',
      'With no ACL markup.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('no-markup');
    expect(result.content).toBe(raw);
  });

  test('idempotent — re-running on already-migrated content is `no-markup`', () => {
    const raw = [
      '---',
      'title: Already',
      'uuid: u8',
      '---',
      '[{ALLOW view Trusted}]',
      '',
      'Body.'
    ].join('\n');
    const first = transformFrontmatter(raw);
    expect(first.outcome).toBe('migrated');
    const second = transformFrontmatter(first.content);
    expect(second.outcome).toBe('no-markup');
    expect(second.content).toBe(first.content);
  });

  test('existing audience/access is preserved and unioned with derived values', () => {
    const raw = [
      '---',
      'title: Both',
      'uuid: u9',
      'audience:',
      '  - existing-role',
      'access:',
      '  edit:',
      '    - existing-user',
      '---',
      '[{ALLOW view Trusted}]',
      '[{ALLOW edit jim}]',
      '',
      'Body.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.audience).toEqual(['existing-role', 'Trusted']);
    expect(data.access).toEqual({ edit: ['existing-user', 'jim'] });
  });

  test('preserves untouched frontmatter — lastModified, user-keywords, slug, system-category', () => {
    const raw = [
      '---',
      'title: Preserve',
      'uuid: u10',
      'slug: preserve',
      'system-category: documentation',
      'lastModified: "2026-02-10T19:52:30.643Z"',
      'user-keywords:',
      '  - tutorial',
      '  - howto',
      '---',
      '[{ALLOW edit Admin}]',
      '',
      'Body.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.title).toBe('Preserve');
    expect(data.slug).toBe('preserve');
    expect(data['system-category']).toBe('documentation');
    expect(data.lastModified).toBe('2026-02-10T19:52:30.643Z');
    expect(data['user-keywords']).toEqual(['tutorial', 'howto']);
  });

  test('mixed `view All` + `view Trusted` keeps the more-restrictive Trusted audience', () => {
    // JSPWiki semantics conflict: All means public, Trusted constrains. We treat the
    // explicit principal as the authoritative intent (admin would not add Trusted by
    // accident) and drop All from the audience set.
    const raw = [
      '---',
      'title: Conflict',
      'uuid: u11',
      '---',
      '[{ALLOW view All}]',
      '[{ALLOW view Trusted}]',
      '',
      'Body.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.audience).toEqual(['Trusted']);
  });

  test('ALLOW markup embedded in middle of body (not at top) is still migrated', () => {
    // Real pages observed at lines 13-15 of AdminsPage — not the very first line,
    // but standalone on their own lines. We match line-anchored, not position-anchored.
    const raw = [
      '---',
      'title: Mid',
      'uuid: u12',
      '---',
      '# Intro',
      '',
      '[{ALLOW edit Admin}]',
      '',
      'Body continues.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.access).toEqual({ edit: ['Admin'] });
    // Body content stripped only the ALLOW line; the intro + continuation remain.
    const remainingBody = body(result.content);
    expect(remainingBody).toContain('# Intro');
    expect(remainingBody).toContain('Body continues.');
    expect(remainingBody).not.toContain('[{ALLOW');
  });

  test('case-insensitive action name normalised to lowercase', () => {
    const raw = [
      '---',
      'title: CaseTest',
      'uuid: u13',
      '---',
      '[{ALLOW Edit jim}]',
      '[{ALLOW VIEW All}]',
      '',
      'Body.'
    ].join('\n');
    const result = transformFrontmatter(raw);
    expect(result.outcome).toBe('migrated');
    const data = fm(result.content);
    expect(data.access).toEqual({ edit: ['jim'] });
    expect(data.audience).toBeUndefined();
  });
});
