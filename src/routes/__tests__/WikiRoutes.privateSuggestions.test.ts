/**
 * GET /api/page-suggestions — the caller's own private pages (#1457).
 *
 * A private page is offered as `store/Title`, the link syntax, so the editor
 * inserts a working link. Never another user's: private titles are in no
 * shared index, and the merge reads this caller's stores only.
 */

import WikiRoutes from '../WikiRoutes';
import type { Request, Response } from 'express';

function makeRoutes(options: {
  publicPages?: string[];
  creatorPages?: Array<{ name?: string; title?: string; isPrivate?: boolean }>;
  getPagesByCreator?: ReturnType<typeof vi.fn>;
}) {
  const getPagesByCreator =
    options.getPagesByCreator ?? vi.fn(async () => options.creatorPages ?? []);

  const pageManager = {
    listPagesFor: vi.fn(async () => options.publicPages ?? []),
    getPageMetadata: vi.fn(async (name: string) => ({ title: name, slug: name })),
    getPagesByCreator
  };

  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'SearchManager') return {};
      if (name === 'PageManager') return pageManager;
      return null;
    })
  };

  return { routes: new WikiRoutes(engine), getPagesByCreator };
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as Response & { json: ReturnType<typeof vi.fn> };
}

function makeReq(query: Record<string, string>, username: string | null) {
  return {
    query,
    userContext: username ? { username, authenticated: true } : undefined
  } as unknown as Request;
}

describe('WikiRoutes.getPageSuggestions — private pages (#1457)', () => {
  test('returns the requester\'s own private pages as store/Title', async () => {
    const { routes } = makeRoutes({
      publicPages: ['Diary Rules'],
      creatorPages: [
        { name: 'vaults/jim/vault/Diary', title: 'Diary', isPrivate: true },
        { name: 'vaults/jim/default/Diary Notes', title: 'Diary Notes', isPrivate: true }
      ]
    });
    const res = makeRes();

    await routes.getPageSuggestions(makeReq({ q: 'diary' }, 'jim'), res);

    const names = res.json.mock.calls[0][0].suggestions.map((s: { name: string }) => s.name);
    expect(names).toContain('vault/Diary');
    expect(names).toContain('default/Diary Notes');
    expect(names).toContain('Diary Rules');
  });

  test('a private suggestion is marked private; a public one is not', async () => {
    const { routes } = makeRoutes({
      publicPages: ['Diary Rules'],
      creatorPages: [{ name: 'vaults/jim/vault/Diary', title: 'Diary', isPrivate: true }]
    });
    const res = makeRes();

    await routes.getPageSuggestions(makeReq({ q: 'diary' }, 'jim'), res);

    const byName = new Map<string, { isPrivate: boolean }>(
      res.json.mock.calls[0][0].suggestions.map((s: { name: string; isPrivate: boolean }) => [s.name, s])
    );
    expect(byName.get('vault/Diary')?.isPrivate).toBe(true);
    expect(byName.get('Diary Rules')?.isPrivate).toBe(false);
  });

  // Found testing #1388: picking a private page in the header search opened /view/vault/Diary, a public lookup that 404s.
  test('a private suggestion carries where the page really is, to view and to edit', async () => {
    const { routes } = makeRoutes({
      publicPages: [],
      creatorPages: [{ name: 'vaults/jim/test-sealed/Clara sealed page 1', title: 'Clara sealed page 1', isPrivate: true }]
    });
    const res = makeRes();

    await routes.getPageSuggestions(makeReq({ q: 'sealed' }, 'jim'), res);

    const [suggestion] = res.json.mock.calls[0][0].suggestions;
    expect(suggestion.name).toBe('test-sealed/Clara sealed page 1');
    expect(suggestion.url).toBe('/vaults/jim/test-sealed/Clara%20sealed%20page%201');
    expect(suggestion.editUrl).toBe('/vaults/jim/test-sealed/Clara%20sealed%20page%201/edit');
  });

  test('never another user\'s private page, whatever the store index returns', async () => {
    const { routes, getPagesByCreator } = makeRoutes({
      publicPages: [],
      creatorPages: [
        { name: 'vaults/jim/vault/Diary', title: 'Diary', isPrivate: true },
        { name: 'vaults/alice/vault/Diary', title: 'Diary', isPrivate: true }
      ]
    });
    const res = makeRes();

    await routes.getPageSuggestions(makeReq({ q: 'diary' }, 'jim'), res);

    const names = res.json.mock.calls[0][0].suggestions.map((s: { name: string }) => s.name);
    expect(names).toEqual(['vault/Diary']);
    // The read is scoped to this caller and carries their context.
    expect(getPagesByCreator).toHaveBeenCalledWith(
      'jim',
      expect.objectContaining({ username: 'jim' }),
      { onlyPrivate: true }
    );
  });

  test('an anonymous caller is offered no private page and no store read is made', async () => {
    const { routes, getPagesByCreator } = makeRoutes({
      publicPages: ['Diary Rules'],
      creatorPages: [{ name: 'vaults/jim/vault/Diary', title: 'Diary', isPrivate: true }]
    });
    const res = makeRes();

    await routes.getPageSuggestions(makeReq({ q: 'diary' }, null), res);

    const names = res.json.mock.calls[0][0].suggestions.map((s: { name: string }) => s.name);
    expect(names).toEqual(['Diary Rules']);
    expect(getPagesByCreator).not.toHaveBeenCalled();
  });
});
