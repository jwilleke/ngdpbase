/**
 * Admin keyword delete / consolidate and private pages (#1382).
 *
 * Both loops re-save every page carrying a keyword. A private page lives in its
 * owner's private container: it is changed only when this request may edit it
 * (`canAccess('edit')` — ACLManager Tier 0: the owner or a delegate, never a
 * role). Another user's private page is left alone; the admin's own private
 * page is saved with the admin's context, which a store write requires.
 */
import WikiRoutes from '../WikiRoutes';
import type { WikiEngine } from '../../types/WikiEngine';

type Resave = (
  wikiContext: unknown,
  pageName: string,
  page: { content: string; metadata?: Record<string, unknown> },
  metadata: Record<string, unknown>
) => Promise<boolean>;

function setup() {
  const savePage = vi.fn().mockResolvedValue(undefined);
  const engine = {
    getManager: vi.fn((name: string) => (name === 'PageManager' ? { savePage } : null))
  } as unknown as WikiEngine;
  const routes = new WikiRoutes(engine) as unknown as { resaveForKeywordChange: Resave };
  return { savePage, resave: routes.resaveForKeywordChange.bind(routes) };
}

const admin = { username: 'root', roles: ['admin'], isAuthenticated: true };

describe('resaveForKeywordChange (#1382)', () => {
  test('another user\'s private page is left unchanged — canAccess refuses', async () => {
    const { savePage, resave } = setup();
    const canAccess = vi.fn().mockResolvedValue(false);
    const saved = await resave(
      { userContext: admin, canAccess },
      'AlicesDiary',
      { content: 'x', metadata: { private: true, author: 'alice', 'user-keywords': ['tech'] } },
      { private: true, author: 'alice', 'user-keywords': [] }
    );
    expect(saved).toBe(false);
    expect(canAccess).toHaveBeenCalledWith('edit', 'AlicesDiary');
    expect(savePage).not.toHaveBeenCalled();
  });

  test('the admin\'s own private page is saved with the admin\'s context', async () => {
    const { savePage, resave } = setup();
    const saved = await resave(
      { userContext: admin, canAccess: vi.fn().mockResolvedValue(true) },
      'RootNotes',
      { content: 'x', metadata: { private: true, author: 'root' } },
      { private: true, author: 'root', 'user-keywords': [] }
    );
    expect(saved).toBe(true);
    expect(savePage).toHaveBeenCalledWith('RootNotes', 'x', expect.any(Object), { actorContext: admin });
  });

  test('a public page is saved as before, without asking about a private container', async () => {
    const { savePage, resave } = setup();
    const canAccess = vi.fn();
    const saved = await resave(
      { userContext: admin, canAccess },
      'Main',
      { content: 'x', metadata: { 'user-keywords': ['tech'] } },
      { 'user-keywords': [] }
    );
    expect(saved).toBe(true);
    expect(canAccess).not.toHaveBeenCalled();
    expect(savePage).toHaveBeenCalledWith('Main', 'x', { 'user-keywords': [] });
  });
});
