/**
 * Tests for #662/#701 — Legacy "User Pages" → user-profile category migration.
 *
 * Tests the pure transformFrontmatter() function so we don't need to touch the
 * filesystem. Each case asserts both the outcome label and (where relevant) the
 * shape of the resulting frontmatter.
 */

import { transformFrontmatter } from '../migrate-user-pages-category';
import matter from 'gray-matter';

function fm(raw: string) {
  return matter(raw).data as Record<string, unknown>;
}

describe('transformFrontmatter (#662/#701)', () => {
  test('legacy "User Pages" → migrated; system-category rewritten, body preserved', () => {
    const raw = [
      '---',
      'title: Molly',
      'uuid: u1',
      'author: jim',
      'system-category: User Pages',
      'slug: molly',
      '---',
      '',
      '# Molly',
      'profile body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('migrated');
    expect(out.previous).toBe('User Pages');
    const data = fm(out.content);
    expect(data['system-category']).toBe('user-profile');
    expect(data.title).toBe('Molly');
    expect(data.slug).toBe('molly');
    expect(out.content).toContain('# Molly');
    expect(out.content).toContain('profile body');
  });

  test('quoted legacy value "User Pages" → migrated', () => {
    const raw = [
      '---',
      'title: Molly',
      'system-category: "User Pages"',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('migrated');
    expect(fm(out.content)['system-category']).toBe('user-profile');
  });

  test('case variants ("user pages", "USER PAGES") → migrated', () => {
    for (const variant of ['user pages', 'USER PAGES', 'User pages', 'user PAGES']) {
      const raw = `---\ntitle: t\nsystem-category: ${variant}\n---\nbody`;
      const out = transformFrontmatter(raw);
      expect(out.outcome).toBe('migrated');
      expect(out.previous).toBe(variant);
      expect(fm(out.content)['system-category']).toBe('user-profile');
    }
  });

  test('already canonical "user-profile" → already; content unchanged', () => {
    const raw = [
      '---',
      'title: Molly',
      'system-category: user-profile',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('already');
    expect(out.content).toBe(raw);
  });

  test('other category (general / system / documentation) → other-category; content unchanged', () => {
    for (const other of ['general', 'system', 'documentation', 'addon']) {
      const raw = `---\ntitle: t\nsystem-category: ${other}\n---\nbody`;
      const out = transformFrontmatter(raw);
      expect(out.outcome).toBe('other-category');
      expect(out.content).toBe(raw);
    }
  });

  test('missing system-category field → other-category; content unchanged', () => {
    const raw = [
      '---',
      'title: NoCategory',
      'uuid: u1',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('other-category');
    expect(out.content).toBe(raw);
  });

  test('non-string system-category value → other-category; content unchanged', () => {
    const raw = [
      '---',
      'title: Odd',
      'system-category:',
      '  - User Pages',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('other-category');
    expect(out.content).toBe(raw);
  });

  test('legacy with surrounding whitespace → migrated', () => {
    const raw = '---\ntitle: t\nsystem-category: "  User Pages  "\n---\nbody';
    const out = transformFrontmatter(raw);
    expect(out.outcome).toBe('migrated');
    expect(fm(out.content)['system-category']).toBe('user-profile');
  });
});
