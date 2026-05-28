/**
 * Tests for the private-field migration script (#639 Slice D + #802 Slice 2).
 *
 * Tests the pure transformFrontmatter() function so we don't need to touch the
 * filesystem. Each case asserts both the outcome label and (where relevant) the
 * shape of the resulting frontmatter.
 */

import { transformFrontmatter } from '../migrate-private-field';
import matter from 'gray-matter';

function fm(raw: string) {
  return matter(raw).data as Record<string, unknown>;
}

describe('transformFrontmatter (#639 Slice D + #802 Slice 2)', () => {
  test('legacy keyword-only → migrated; private:true set, keyword stripped, body preserved', () => {
    const raw = [
      '---',
      'title: Secret',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'user-keywords:',
      '  - private',
      '  - draft',
      '---',
      '',
      '# Hello',
      'body content'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('migrated');
    const data = fm(out.content);
    expect(data.private).toBe(true);
    expect(data['user-keywords']).toEqual(['draft']);
    expect(out.content).toContain('# Hello');
    expect(out.content).toContain('body content');
  });

  test('keyword-only with no other keywords → user-keywords field is dropped entirely', () => {
    const raw = [
      '---',
      'title: Secret',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'user-keywords:',
      '  - private',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('migrated');
    const data = fm(out.content);
    expect(data.private).toBe(true);
    expect(data['user-keywords']).toBeUndefined();
  });

  test('already migrated (top-level private:true, no keyword) → already; content unchanged', () => {
    const raw = [
      '---',
      'title: Secret',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'private: true',
      'user-keywords:',
      '  - draft',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('already');
    expect(out.content).toBe(raw); // unchanged
  });

  test('non-private (no signals) → non-private; content unchanged', () => {
    const raw = [
      '---',
      'title: Public',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'user-keywords:',
      '  - draft',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('non-private');
    expect(out.content).toBe(raw);
  });

  test('both signals present (transitional state from manual edit) → migrated; keyword stripped', () => {
    const raw = [
      '---',
      'title: Secret',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'private: true',
      'user-keywords:',
      '  - private',
      '  - wip',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('migrated');
    const data = fm(out.content);
    expect(data.private).toBe(true);
    expect(data['user-keywords']).toEqual(['wip']);
  });

  test('case-insensitive keyword match (Private, PRIVATE)', () => {
    const raw = [
      '---',
      'title: Secret',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'user-keywords:',
      '  - Private',
      '  - PRIVATE',
      '  - draft',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('migrated');
    const data = fm(out.content);
    expect(data.private).toBe(true);
    expect(data['user-keywords']).toEqual(['draft']);
  });

  test('no user-keywords field at all → non-private (idempotent on bare pages)', () => {
    const raw = [
      '---',
      'title: Bare',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('non-private');
    expect(out.content).toBe(raw);
  });

  test('idempotent — running twice on a migrated file is a no-op the second time', () => {
    const raw = [
      '---',
      'title: Secret',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'user-keywords:',
      '  - private',
      '---',
      'body'
    ].join('\n');

    const first = transformFrontmatter(raw);
    expect(first.outcome).toBe('migrated');

    const second = transformFrontmatter(first.content);
    expect(second.outcome).toBe('already');
    expect(second.content).toBe(first.content);
  });

  // ── #802 Slice 2: system-location legacy signal ────────────────────────────

  test('#802 — system-location:private only → migrated; private:true set, system-location PRESERVED (until Slice 3)', () => {
    const raw = [
      '---',
      'title: Journal Entry',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'system-location: private',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('migrated');
    const data = fm(out.content);
    expect(data.private).toBe(true);
    // system-location is preserved in promote mode — providers still need it
    // for storage routing until Slice 3 ships. Slice 4 will drop it.
    expect(data['system-location']).toBe('private');
  });

  test('#802 — private:true + system-location:private (PageManager-emitted shape) → already canonical (both kept)', () => {
    const raw = [
      '---',
      'title: Locked',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'private: true',
      'system-location: private',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    // private:true already set; system-location is a legacy field but the
    // promote path doesn't strip it. Treated as 'already' — nothing to do.
    expect(out.outcome).toBe('already');
    expect(out.content).toBe(raw);
  });

  test('#802 — both legacy signals (user-keywords:private AND system-location:private) → migrated; keyword stripped, system-location kept', () => {
    const raw = [
      '---',
      'title: Doubly Legacy',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'user-keywords:',
      '  - private',
      '  - draft',
      'system-location: private',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('migrated');
    const data = fm(out.content);
    expect(data.private).toBe(true);
    expect(data['user-keywords']).toEqual(['draft']);
    expect(data['system-location']).toBe('private');
  });

  test('#802 — non-private system-location value (e.g. "regular") left alone', () => {
    const raw = [
      '---',
      'title: Public',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'system-location: regular',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    // No private signal present (regular ≠ private), so this is non-private.
    // We do NOT touch the field — conservative behavior.
    expect(out.outcome).toBe('non-private');
    expect(out.content).toBe(raw);
  });

  test('#802 — idempotent on system-location migration: second run is no-op', () => {
    const raw = [
      '---',
      'title: Journal Entry',
      'uuid: u1',
      'lastModified: "2026-01-01"',
      'author: alice',
      'system-location: private',
      '---',
      'body'
    ].join('\n');

    const first = transformFrontmatter(raw);
    expect(first.outcome).toBe('migrated');
    expect(fm(first.content).private).toBe(true);
    // system-location preserved in promote mode (Slice 3 prerequisite).
    expect(fm(first.content)['system-location']).toBe('private');

    const second = transformFrontmatter(first.content);
    expect(second.outcome).toBe('already');
    expect(second.content).toBe(first.content);
  });

  // ── #802 stripOnly mode (required-pages: no per-page access controls) ──────

  test('stripOnly — all three legacy signals + private:true → cleaned (no private:true set, all stripped)', () => {
    const raw = [
      '---',
      'title: Page Private (doc)',
      'uuid: u1',
      'system-category: documentation',
      'user-keywords:',
      '  - private',
      '  - access control',
      'system-location: private',
      'private: true',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw, { stripOnly: true });

    expect(out.outcome).toBe('cleaned');
    const data = fm(out.content);
    expect(data.private).toBeUndefined();
    expect(data['system-location']).toBeUndefined();
    expect(data['user-keywords']).toEqual(['access control']);
  });

  test('stripOnly — audience field is stripped unconditionally', () => {
    const raw = [
      '---',
      'title: Public Doc',
      'uuid: u1',
      'system-category: documentation',
      'audience:',
      '  - admin',
      '  - editor',
      '  - contributor',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw, { stripOnly: true });

    expect(out.outcome).toBe('cleaned');
    const data = fm(out.content);
    expect(data['audience']).toBeUndefined();
    expect(data.private).toBeUndefined();
  });

  test('stripOnly — combined: legacy signals + audience together → all stripped, cleaned', () => {
    const raw = [
      '---',
      'title: Worst Case',
      'uuid: u1',
      'system-category: documentation',
      'user-keywords:',
      '  - private',
      'private: true',
      'audience:',
      '  - admin',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw, { stripOnly: true });

    expect(out.outcome).toBe('cleaned');
    const data = fm(out.content);
    expect(data.private).toBeUndefined();
    expect(data['user-keywords']).toBeUndefined();
    expect(data['audience']).toBeUndefined();
  });

  test('stripOnly — already-clean page → non-private (no rewrite)', () => {
    const raw = [
      '---',
      'title: Plain Doc',
      'uuid: u1',
      'system-category: documentation',
      'user-keywords:',
      '  - documentation',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw, { stripOnly: true });

    expect(out.outcome).toBe('non-private');
    expect(out.content).toBe(raw);
  });

  test('stripOnly — idempotent: second run on cleaned content is a no-op', () => {
    const raw = [
      '---',
      'title: Page Audience (doc)',
      'uuid: u1',
      'system-category: documentation',
      'audience:',
      '  - admin',
      '  - editor',
      '---',
      'body'
    ].join('\n');

    const first = transformFrontmatter(raw, { stripOnly: true });
    expect(first.outcome).toBe('cleaned');
    expect(fm(first.content)['audience']).toBeUndefined();

    const second = transformFrontmatter(first.content, { stripOnly: true });
    expect(second.outcome).toBe('non-private');
    expect(second.content).toBe(first.content);
  });

  // ── Category-based stripOnly (catches seeded required-pages in pages/) ─────

  test('category=documentation auto-stripOnly: user-keywords:[private] is stripped, NOT promoted to private:true', () => {
    // Seeded copy of the "Page Private" doc sitting in pages/ — must not be
    // promoted to private:true just because the legacy keyword is present.
    const raw = [
      '---',
      'title: Page Private',
      'uuid: u1',
      'system-category: documentation',
      'user-keywords:',
      '  - private',
      '  - page privacy',
      '  - access control',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);  // no opts.stripOnly

    expect(out.outcome).toBe('cleaned');
    const data = fm(out.content);
    expect(data.private).toBeUndefined();
    expect(data['user-keywords']).toEqual(['page privacy', 'access control']);
  });

  test('category=system auto-stripOnly: private:true is stripped (system pages must not be private)', () => {
    const raw = [
      '---',
      'title: System Page',
      'uuid: u1',
      'system-category: system',
      'private: true',
      'audience:',
      '  - admin',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);  // no opts.stripOnly

    expect(out.outcome).toBe('cleaned');
    const data = fm(out.content);
    expect(data.private).toBeUndefined();
    expect(data['audience']).toBeUndefined();
  });

  test('category=general (regular storage) uses promote mode: legacy keyword → private:true', () => {
    // User pages aren't required-storage; they should still get the normal
    // promote-to-canonical treatment when carrying a legacy signal.
    const raw = [
      '---',
      'title: My Notes',
      'uuid: u1',
      'system-category: general',
      'user-keywords:',
      '  - private',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('migrated');
    const data = fm(out.content);
    expect(data.private).toBe(true);
  });

  test('category=journal uses promote mode (journal entries CAN be private)', () => {
    const raw = [
      '---',
      'title: Journal - jim - 2026-05-28',
      'uuid: u1',
      'system-category: journal',
      'system-location: private',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('migrated');
    const data = fm(out.content);
    expect(data.private).toBe(true);
    // system-location preserved in promote mode (Slice 3 prerequisite).
    expect(data['system-location']).toBe('private');
  });

  test('category=documentation with NO signals → non-private (no rewrite)', () => {
    const raw = [
      '---',
      'title: Plain Doc',
      'uuid: u1',
      'system-category: documentation',
      'user-keywords:',
      '  - documentation',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('non-private');
    expect(out.content).toBe(raw);
  });

  test('case-insensitive category match: System-Category="Documentation" still triggers stripOnly', () => {
    const raw = [
      '---',
      'title: Mixed Case',
      'uuid: u1',
      'system-category: Documentation',
      'private: true',
      '---',
      'body'
    ].join('\n');

    const out = transformFrontmatter(raw);

    expect(out.outcome).toBe('cleaned');
    expect(fm(out.content).private).toBeUndefined();
  });
});
