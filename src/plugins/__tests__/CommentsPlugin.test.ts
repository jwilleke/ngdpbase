/**
 * CommentsPlugin tests
 *
 * Covers:
 * - No engine → ''
 * - No CommentManager or disabled → ''
 * - No pageUuid → ''
 * - Empty comments → "No comments yet"
 * - Comments rendered for authenticated/anonymous users
 * - Admin/owner delete button
 * - noheader=true suppresses heading
 *
 * @jest-environment node
 */

import CommentsPlugin from '../CommentsPlugin';

const makeCommentManager = (enabled = true, comments: unknown[] = []) => ({
  isEnabled: () => enabled,
  getComments: vi.fn().mockResolvedValue(comments)
});

// #1198: the plugin asks policy, not a role name. This stand-in answers as the
// shipped policies do for the roles the tests use.
const policyUserManager = {
  hasPermission: vi.fn(async (subject: { roles?: string[] } | null | undefined, action: string) => {
    const roles = subject?.roles ?? [];
    if (action === 'admin-system') return roles.includes('admin');
    return roles.includes('admin') || roles.includes('editor') || roles.includes('contributor');
  })
};
const makeEngine = (managers: Record<string, unknown> = {}) => ({
  getManager: vi.fn((name: string) => managers[name] ?? (name === 'UserManager' ? policyUserManager : null)),
  logger: { error: vi.fn() }
});

const sampleComment = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'cmt-1',
  author: 'alice',
  authorDisplayName: 'Alice Smith',
  content: 'Great page!',
  createdAt: '2026-04-24T10:00:00Z',
  ...overrides
});

describe('CommentsPlugin', () => {
  describe('metadata', () => {
    test('has correct name and version', () => {
      expect(CommentsPlugin.name).toBe('CommentsPlugin');
      expect(CommentsPlugin.version).toBe('1.0.0');
      expect(typeof CommentsPlugin.execute).toBe('function');
    });
  });

  describe('early returns', () => {
    test('returns empty string when engine is null', async () => {
      const result = await CommentsPlugin.execute({ engine: null }, {});
      expect(result).toBe('');
    });

    test('returns empty string when CommentManager unavailable', async () => {
      const context = { engine: makeEngine() };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toBe('');
    });

    test('returns empty string when CommentManager disabled', async () => {
      const cm = makeCommentManager(false);
      const context = { engine: makeEngine({ CommentManager: cm }) };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toBe('');
    });

    test('returns empty string when pageUuid is missing', async () => {
      const cm = makeCommentManager(true);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: {}
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toBe('');
    });
  });

  describe('no comments', () => {
    test('shows "No comments yet" message', async () => {
      const cm = makeCommentManager(true, []);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: { isAuthenticated: false }
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toContain('No comments yet');
      expect(result).toContain('page-comments');
    });

    test('shows h2 heading by default', async () => {
      const cm = makeCommentManager(true, []);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: {}
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toContain('<h2>Comments</h2>');
    });

    test('noheader=true suppresses h2', async () => {
      const cm = makeCommentManager(true, []);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: {}
      };
      const result = await CommentsPlugin.execute(context, { noheader: 'true' });
      expect(result).not.toContain('<h2>Comments</h2>');
      expect(result).toContain('page-comments');
    });
  });

  describe('with comments', () => {
    test('renders comment list with author and content', async () => {
      const comment = sampleComment();
      const cm = makeCommentManager(true, [comment]);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: { isAuthenticated: false }
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toContain('comment-list');
      expect(result).toContain('Alice Smith');
      expect(result).toContain('Great page!');
    });

    test('renders comment id as anchor', async () => {
      const comment = sampleComment({ id: 'cmt-abc' });
      const cm = makeCommentManager(true, [comment]);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: { isAuthenticated: false }
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toContain('id="comment-cmt-abc"');
    });

    test('hostile HTML in comment content never survives as markup (#1123)', async () => {
      // Pre-#1123 this was entity-escaped into visible text; the
      // untrusted-inline profile STRIPS it instead. Either way the invariant
      // under test is the same: a commenter's script tag must not execute.
      const comment = sampleComment({ content: '<script>alert("xss")</script> still here' });
      const cm = makeCommentManager(true, [comment]);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: { isAuthenticated: false }
      };
      const result = await CommentsPlugin.execute(context, {});
      // The tag is stripped; its inner text may remain as inert prose —
      // SecurityFilter's own doctrine: text cannot execute, script needs a tag.
      expect(result).not.toContain('<script');
      expect(result).toContain('still here');
    });
  });

  describe('authenticated user actions', () => {
    test('shows comment form for authenticated user', async () => {
      const cm = makeCommentManager(true, []);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: { isAuthenticated: true, username: 'alice', displayName: 'Alice' }
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toContain('comment-form');
      expect(result).toContain('Alice');
    });

    test('shows login prompt for anonymous user', async () => {
      const cm = makeCommentManager(true, []);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: { isAuthenticated: false }
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toContain('logged in');
      expect(result).not.toContain('comment-form');
    });

    test('admin sees delete button on any comment', async () => {
      const comment = sampleComment({ author: 'otheruser' });
      const cm = makeCommentManager(true, [comment]);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: { isAuthenticated: true, username: 'admin', roles: ['admin'] }
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toContain('comment-delete-btn');
    });

    test('owner sees delete button on own comment', async () => {
      const comment = sampleComment({ author: 'alice' });
      const cm = makeCommentManager(true, [comment]);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: { isAuthenticated: true, username: 'alice', roles: ['editor'] }
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toContain('comment-delete-btn');
    });

    test('non-owner does not see delete button on others comment', async () => {
      const comment = sampleComment({ author: 'alice' });
      const cm = makeCommentManager(true, [comment]);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'page-uuid-1' },
        userContext: { isAuthenticated: true, username: 'bob', roles: ['editor'] }
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).not.toContain('comment-delete-btn');
    });
  });

  describe('username in form', () => {
    test('falls back to name when displayName absent', async () => {
      const cm = makeCommentManager(true, []);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'uuid-1' },
        userContext: { isAuthenticated: true, username: 'bob', name: 'Bobby' }
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toContain('Bobby');
    });

    test('falls back to username when no displayName or name', async () => {
      const cm = makeCommentManager(true, []);
      const context = {
        engine: makeEngine({ CommentManager: cm }),
        pageMetadata: { uuid: 'uuid-1' },
        userContext: { isAuthenticated: true, username: 'charlie' }
      };
      const result = await CommentsPlugin.execute(context, {});
      expect(result).toContain('charlie');
    });
  });
});
