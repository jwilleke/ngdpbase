/**
 * #1622 — page-read is decided inside PageManager's reads.
 *
 * `readPage`, `readVersionHistory`, `readVersion` and `readVersionDiff` are the
 * door a person's read goes through. Each resolves the identifier, decides
 * page-read on the page it resolved to, and only then reads a byte of content.
 * A caller that may not read the page gets a refusal, never the page.
 *
 * These run the REAL `PolicyInformationPoint` behind the door: the defect was a
 * read that asked nobody, and a mocked decider cannot show who was asked about
 * what. Only the provider (storage) and global policy are stubbed — policy lets
 * every reader view every page, so a refusal here comes from the page's own
 * audience, which is the case the four API routes leaked.
 */
vi.unmock('../PageManager');
import PageManager from '../PageManager';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';

type Meta = Record<string, unknown>;

const PAGES: Record<string, Meta> = {
  Public: { title: 'Public', uuid: 'u-public', slug: 'public' },
  MembersOnly: { title: 'MembersOnly', uuid: 'u-members', slug: 'members-only', audience: ['reader'] },
  Damaged: { title: 'Damaged', uuid: 'u-damaged' }
};
const CONTENT: Record<string, string> = {
  Public: 'public words',
  MembersOnly: 'MEMBERS-ONLY-TEXT',
  Damaged: 'damaged words'
};

/** The provider resolves a uuid, a slug or a title, as FileSystemProvider does. */
function resolve(identifier: string): string | null {
  for (const [title, meta] of Object.entries(PAGES)) {
    if (identifier === title || identifier === meta.uuid || identifier === meta.slug) return title;
  }
  return null;
}

const anonymous = { username: 'Anonymous', roles: ['anonymous', 'All'], isAuthenticated: false };
const reader = { username: 'bob', roles: ['reader', 'Authenticated', 'All'], isAuthenticated: true };

function makeManager(options: { withPip?: boolean } = {}) {
  const provider = {
    getPageMetadata: vi.fn(async (id: string) => {
      const title = resolve(id);
      return title && title !== 'Damaged' ? { ...PAGES[title] } : null;
    }),
    pageExists: vi.fn((id: string) => resolve(id) !== null),
    getPage: vi.fn(async (id: string) => {
      const title = resolve(id);
      return title ? { title, uuid: PAGES[title].uuid, content: CONTENT[title], metadata: PAGES[title], filePath: '' } : null;
    }),
    getVersionHistory: vi.fn(async () => [{ version: 2 }, { version: 1 }]),
    getPageVersion: vi.fn(async (_id: string, version: number) => ({ version, content: `v${version}`, metadata: {} })),
    compareVersions: vi.fn(async (_id: string, v1: number, v2: number) => ({ fromVersion: v1, toVersion: v2, diff: [], stats: {} }))
  };
  let pip: unknown = null;
  const asked: Array<{ pageName: string; action: string }> = [];
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'PolicyInformationPoint') return options.withPip === false ? null : pip;
      if (name === 'PageManager') return pm;
      // Global policy: every reader views every page. Only the page's own rules refuse.
      if (name === 'PolicyEvaluator') {
        return {
          evaluateAccess: async ({ pageName, action }: { pageName: string; action: string }) => {
            asked.push({ pageName, action });
            return { hasDecision: true, allowed: true, policyName: 'everyone-reads', reason: 'test' };
          }
        };
      }
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      return null;
    }
  };
  const pm = new PageManager(engine);
  (pm as unknown as { provider: unknown }).provider = provider;
  pip = new PolicyInformationPoint(engine);
  return { pm, provider, asked };
}

describe('PageManager.readPage — the page-read door (#1622)', () => {
  test('a caller outside the page\'s audience gets a refusal, and no content is read', async () => {
    const { pm, provider } = makeManager();
    const read = await pm.readPage('MembersOnly', anonymous);
    expect(read).toEqual({ ok: false, refusal: 'denied' });
    expect(provider.getPage).not.toHaveBeenCalled();
  });

  test('a caller in the audience reads the page, with the name and metadata decided on', async () => {
    const { pm } = makeManager();
    const read = await pm.readPage('MembersOnly', reader);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.content).toBe('MEMBERS-ONLY-TEXT');
    expect(read.name).toBe('MembersOnly');
    expect(read.metadata.uuid).toBe('u-members');
  });

  test('a public page is read by anyone', async () => {
    const { pm } = makeManager();
    const read = await pm.readPage('Public', anonymous);
    expect(read.ok && read.value.content).toBe('public words');
  });

  test('a page that does not exist is not-found; one with no metadata is no-metadata — both refusals', async () => {
    const { pm } = makeManager();
    expect(await pm.readPage('Nowhere', reader as never)).toEqual({ ok: false, refusal: 'not-found' });
    expect(await pm.readPage('Damaged', reader as never)).toEqual({ ok: false, refusal: 'no-metadata' });
  });

  test('a slug or uuid is decided on the page it resolves to, and that same page is read', async () => {
    const { pm, provider } = makeManager();
    expect(await pm.readPage('members-only', anonymous as never)).toEqual({ ok: false, refusal: 'denied' });
    expect(await pm.readPage('u-members', anonymous as never)).toEqual({ ok: false, refusal: 'denied' });
    const read = await pm.readPage('members-only', reader);
    expect(read.ok && read.name).toBe('MembersOnly');
    // Read by the resolved uuid, so the read cannot land on another page.
    expect(provider.getPage).toHaveBeenLastCalledWith('u-members', reader);
  });

  test('the caller\'s own context is what reaches storage — forwarded, not rebuilt', async () => {
    const { pm, provider } = makeManager();
    await pm.readPage('Public', reader);
    expect(provider.getPageMetadata.mock.calls[0][1]).toBe(reader);
    expect(provider.getPage.mock.calls[0][1]).toBe(reader);
  });

  test('without a PolicyInformationPoint nothing is readable — never the page by accident', async () => {
    const { pm, provider } = makeManager({ withPip: false });
    expect(await pm.readPage('Public', reader as never)).toEqual({ ok: false, refusal: 'denied' });
    expect(provider.getPage).not.toHaveBeenCalled();
  });

  test('a read with no context is a caller bug, and throws', async () => {
    const { pm } = makeManager();
    await expect(pm.readPage('Public', undefined as never)).rejects.toThrow(/ActorContext/);
  });

  test('scalar keywords reach the decision as a list, and the provider\'s copy is untouched', async () => {
    const { pm } = makeManager();
    const stored = PAGES.Public;
    stored['user-keywords'] = 'trip family';
    try {
      const read = await pm.readPage('Public', reader);
      expect(read.ok && read.metadata['user-keywords']).toEqual(['trip', 'family']);
      expect(stored['user-keywords']).toBe('trip family');
    } finally {
      delete stored['user-keywords'];
    }
  });
});

describe('PageManager version reads — the same door (#1622)', () => {
  const reads = {
    readVersionHistory: (pm: PageManager, id: string, ctx: unknown) => pm.readVersionHistory(id, ctx),
    readVersion: (pm: PageManager, id: string, ctx: unknown) => pm.readVersion(id, 1, ctx),
    readVersionDiff: (pm: PageManager, id: string, ctx: unknown) => pm.readVersionDiff(id, 1, 2, ctx)
  };
  const providerCall = {
    readVersionHistory: 'getVersionHistory',
    readVersion: 'getPageVersion',
    readVersionDiff: 'compareVersions'
  } as const;

  test.each(Object.keys(reads) as Array<keyof typeof reads>)('%s: refused outside the audience, and the history is never read', async (method) => {
    const { pm, provider } = makeManager();
    expect(await reads[method](pm, 'MembersOnly', anonymous)).toEqual({ ok: false, refusal: 'denied' });
    expect(provider[providerCall[method]]).not.toHaveBeenCalled();
  });

  test.each(Object.keys(reads) as Array<keyof typeof reads>)('%s: read in the audience, by the resolved page\'s uuid', async (method) => {
    const { pm, provider } = makeManager();
    const read = await reads[method](pm, 'members-only', reader);
    expect(read.ok).toBe(true);
    expect(provider[providerCall[method]].mock.calls[0][0]).toBe('u-members');
  });

  test.each(Object.keys(reads) as Array<keyof typeof reads>)('%s: a public page\'s history is anyone\'s', async (method) => {
    const { pm } = makeManager();
    expect((await reads[method](pm, 'Public', anonymous)).ok).toBe(true);
  });

  test.each(Object.keys(reads) as Array<keyof typeof reads>)('%s: a page that does not exist is not-found', async (method) => {
    const { pm } = makeManager();
    expect(await reads[method](pm, 'Nowhere', reader)).toEqual({ ok: false, refusal: 'not-found' });
  });

  test('a private page is read by its vault name, not a uuid the shared index does not hold', async () => {
    const { pm, provider } = makeManager();
    const name = 'vaults/bob/vault/Diary';
    provider.getPageMetadata.mockResolvedValueOnce({ title: 'Diary', uuid: 'u-diary' });
    const read = await pm.readVersionHistory(name, reader);
    expect(read.ok && read.name).toBe(name);
    expect(provider.getVersionHistory.mock.calls[0][0]).toBe(name);
  });

  test('a provider that keeps no history: the decision is made, then the read throws', async () => {
    const { pm, provider } = makeManager();
    delete (provider as Partial<typeof provider>).getVersionHistory;
    await expect(pm.readVersionHistory('Public', reader as never)).rejects.toThrow(/no version history/);
  });
});
