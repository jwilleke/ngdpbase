/**
 * Unit tests for renderCommentListHtml — the helper extracted in #590 so the
 * partial-render endpoint can reuse the same rendering as the plugin.
 */

import { describe, test, expect } from 'vitest';
import { renderCommentListHtml } from '../CommentsPlugin';
import type { PageComment } from '../../types/Comment';

function makeComment(overrides: Partial<PageComment> = {}): PageComment {
  return {
    id: 'c1',
    pageUuid: 'page-1',
    author: 'alice',
    authorDisplayName: 'Alice',
    content: 'Hello world',
    createdAt: '2026-04-30T12:00:00Z',
    deleted: false,
    ...overrides
  } as PageComment;
}

describe('renderCommentListHtml (#590)', () => {
  test('returns no-comments paragraph when list is empty', async () => {
    const html = await renderCommentListHtml([], false, '', false, 'page-1');
    expect(html).toContain('no-comments');
    expect(html).toContain('No comments yet');
  });

  test('renders authorDisplayName, content, and a comment-list wrapper', async () => {
    const html = await renderCommentListHtml(
      [makeComment({ id: 'c1', authorDisplayName: 'Alice', content: 'Hi' })],
      true, 'bob', false, 'page-1'
    );
    expect(html).toContain('comment-list');
    expect(html).toContain('Alice');
    expect(html).toContain('Hi');
  });

  test('shows delete button only for the comment author', async () => {
    const html = await renderCommentListHtml(
      [makeComment({ id: 'c1', author: 'alice' })],
      true, 'alice', false, 'page-1'
    );
    expect(html).toContain('comment-delete-btn');
  });

  test('shows delete button for admin even on someone else\'s comment', async () => {
    const html = await renderCommentListHtml(
      [makeComment({ id: 'c1', author: 'alice' })],
      true, 'bob', true, 'page-1'
    );
    expect(html).toContain('comment-delete-btn');
  });

  test('hides delete button when caller is neither author nor admin', async () => {
    const html = await renderCommentListHtml(
      [makeComment({ id: 'c1', author: 'alice' })],
      true, 'bob', false, 'page-1'
    );
    expect(html).not.toContain('comment-delete-btn');
  });

  test('escapes HTML in content (no engine: escape fallback)', async () => {
    const html = await renderCommentListHtml(
      [makeComment({ content: '<script>alert(1)</script>' })],
      false, '', false, 'page-1'
    );
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

// #1123: with an engine, comment bodies render through the untrusted-inline
// profile — markdown formatting works, hostile markup does not.
describe('renderCommentListHtml with the untrusted-inline profile (#1123)', () => {
  const engine = {
    getManager: (name: string) =>
      name === 'ConfigurationManager'
        ? { getProperty: (_k: string, d: unknown) => d }
        : null
  };

  test('markdown in a comment renders', async () => {
    const html = await renderCommentListHtml(
      [makeComment({ content: 'Some **bold** and `code`' })],
      false, '', false, 'page-1', engine
    );
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  test('a hostile comment is stripped, not executed', async () => {
    const html = await renderCommentListHtml(
      [makeComment({ content: '<script>alert(1)</script> <iframe src="//evil"></iframe> fine' })],
      false, '', false, 'page-1', engine
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('fine');
  });

  test('plugin syntax in a comment stays literal', async () => {
    const html = await renderCommentListHtml(
      [makeComment({ content: '[{SearchPlugin query=secret}]' })],
      false, '', false, 'page-1', engine
    );
    expect(html).toContain('[{SearchPlugin query=secret}]');
  });
});
