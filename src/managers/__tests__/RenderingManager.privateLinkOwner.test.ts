/**
 * Whose store a `[store/Title]` link resolves in (#1457, epic #1454).
 *
 * The owner of the page the link is written in — its name when it is private,
 * its author when it is public — resolved once per render and handed to the
 * parser as `pageOwner`. Never the reader: rendered HTML is cached and shared.
 */

import RenderingManager from '../RenderingManager';

function makeManager(options: {
  author?: string | null;
  markupParser?: { parse: ReturnType<typeof vi.fn>; isInitialized: () => boolean };
  getPageMetadata?: ReturnType<typeof vi.fn>;
}) {
  const getPageMetadata =
    options.getPageMetadata ??
    vi.fn(async () => (options.author ? { author: options.author } : null));

  const pageManager = {
    isSharedIndexable: vi.fn(() => true),
    getAllPages: vi.fn(async () => ['HomePage']),
    getPage: vi.fn(async () => null),
    getPageMetadata
  };

  const engine = {
    log: vi.fn(),
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') {
        return {
          getProperty: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
          getBaseURL: vi.fn(() => 'http://localhost:3000')
        };
      }
      if (name === 'PageManager') return pageManager;
      if (name === 'MarkupParser') return options.markupParser ?? null;
      return null;
    })
  };

  return { engine, pageManager, getPageMetadata };
}

async function capturedParseContext(options: {
  content: string;
  pageName: string;
  author?: string | null;
  getPageMetadata?: ReturnType<typeof vi.fn>;
}) {
  const parse = vi.fn(async () => '<p>ok</p>');
  const markupParser = { parse, isInitialized: () => true };
  const { engine, getPageMetadata } = makeManager({
    author: options.author,
    markupParser,
    getPageMetadata: options.getPageMetadata
  });

  const manager = new RenderingManager(engine);
  await manager.initialize();
  await manager.renderWithAdvancedParser(options.content, options.pageName, null, null);

  return { context: parse.mock.calls[0][1] as Record<string, unknown>, getPageMetadata };
}

describe('RenderingManager — private link owner (#1457)', () => {
  test('a private page owns its links: the owner comes from the page name', async () => {
    const { context, getPageMetadata } = await capturedParseContext({
      content: 'See [vault/Diary].',
      pageName: 'private/jim/default/Notes'
    });

    expect(context.pageOwner).toBe('jim');
    // The name already says who; no metadata read is spent on it.
    expect(getPageMetadata).not.toHaveBeenCalled();
  });

  test('a public page\'s owner is its author', async () => {
    const { context } = await capturedParseContext({
      content: 'See [vault/Diary].',
      pageName: 'HomePage',
      author: 'jim'
    });

    expect(context.pageOwner).toBe('jim');
  });

  test('content with no private link costs no metadata read', async () => {
    const { context, getPageMetadata } = await capturedParseContext({
      content: 'See [Diary] and [Docs|https://example.com/a/b].',
      pageName: 'HomePage',
      author: 'jim'
    });

    expect(getPageMetadata).not.toHaveBeenCalled();
    expect(context.pageOwner).toBeUndefined();
  });

  test('no owner established leaves the link as it renders today', async () => {
    const { context } = await capturedParseContext({
      content: 'See [vault/Diary].',
      pageName: 'HomePage',
      author: null
    });

    expect(context.pageOwner).toBeUndefined();
  });

  test('the owner does not depend on who is reading', async () => {
    const parse = vi.fn(async () => '<p>ok</p>');
    const { engine } = makeManager({ author: 'jim', markupParser: { parse, isInitialized: () => true } });
    const manager = new RenderingManager(engine);
    await manager.initialize();

    await manager.renderWithAdvancedParser('See [vault/Diary].', 'HomePage', { username: 'jim' }, null);
    await manager.renderWithAdvancedParser('See [vault/Diary].', 'HomePage', { username: 'stranger' }, null);

    expect((parse.mock.calls[0][1] as Record<string, unknown>).pageOwner).toBe('jim');
    expect((parse.mock.calls[1][1] as Record<string, unknown>).pageOwner).toBe('jim');
  });
});
