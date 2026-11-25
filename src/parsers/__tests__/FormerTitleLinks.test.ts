/**
 * A link written with a page's former title must not draw as a red link.
 *
 * "My Links" was renamed "Pinned pages". A page that still says [My Links]
 * used to show a red "Create page" link that opened the editor. The link is
 * now drawn as an existing page: it goes to /view/My%20Links, and the view
 * route sends the reader on to the renamed page. The renderers learn the
 * former titles from PageManager.getFormerTitleLinkNames(), which already
 * leaves out titles a live page holds and pages a reader may not see.
 */
import LinkParserHandler from '../handlers/LinkParserHandler';
import DOMLinkHandler from '../dom/handlers/DOMLinkHandler';
import { DOMParser } from '../dom/DOMParser';

vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn().mockResolvedValue(false),
    readJson: vi.fn().mockResolvedValue({})
  },
  pathExists: vi.fn().mockResolvedValue(false),
  readJson: vi.fn().mockResolvedValue({})
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

function makeEngine(pageNames: string[], formerTitleLinkNames: string[]) {
  const pageManager = {
    getAllPages: vi.fn().mockResolvedValue(pageNames),
    getFormerTitleLinkNames: vi.fn().mockResolvedValue(formerTitleLinkNames)
  };
  const configManager = {
    getProperty: vi.fn((_key: string, dv: unknown) => dv)
  };
  return {
    getManager: vi.fn((name: string) => {
      if (name === 'PageManager') return pageManager;
      if (name === 'ConfigurationManager') return configManager;
      return null;
    })
  };
}

describe('a link that still uses a former page title', () => {
  describe('in the text link renderer', () => {
    async function init(pages: string[], former: string[]): Promise<LinkParserHandler> {
      const handler = new LinkParserHandler();
      const engine = makeEngine(pages, former);
      await (handler as unknown as { onInitialize: (ctx: unknown) => Promise<void> }).onInitialize({ engine });
      return handler;
    }
    const ctx = { pageName: 'Garden', engine: { getManager: vi.fn(() => null) } };

    test('[My Links] is not a red link and goes to /view/', async () => {
      const handler = await init(['Pinned pages', 'Garden'], ['my links']);
      const html = await handler.process('See [My Links] and [Pinned pages]', ctx);
      expect(html).toContain('href="/view/My%20Links"');
      expect(html).not.toContain('/edit/My%20Links');
      expect(html).not.toContain('redlink');
      expect(html).not.toContain('Create page');
    });

    test('is found again after the page list is refreshed', async () => {
      const handler = await init(['Garden'], []);
      (handler as unknown as { engine: unknown }).engine = makeEngine(['Pinned pages', 'Garden'], ['my links']);
      await handler.refreshPageNames();
      const html = await handler.process('[My Links]', ctx);
      expect(html).toContain('href="/view/My%20Links"');
      expect(html).not.toContain('redlink');
    });

    test('a name nobody held before is still a red link', async () => {
      const handler = await init(['Pinned pages', 'Garden'], ['my links']);
      const html = await handler.process('[Never Existed]', ctx);
      expect(html).toContain('href="/edit/Never%20Existed"');
      expect(html).toContain('redlink');
    });

    test('a former title that is not offered (live page, hidden page, two claims) stays red', async () => {
      const handler = await init(['Pinned pages', 'Garden'], []);
      const html = await handler.process('[My Links]', ctx);
      expect(html).toContain('href="/edit/My%20Links"');
      expect(html).toContain('redlink');
    });

    test('a live page with that exact title wins over the former title', async () => {
      const handler = await init(['My Links', 'Pinned pages'], ['my links']);
      const html = await handler.process('[My Links]', ctx);
      expect(html).toContain('href="/view/My%20Links"');
      expect(html).not.toContain('redlink');
    });
  });

  describe('in the page renderer', () => {
    async function init(pages: string[], former: string[]): Promise<DOMLinkHandler> {
      const handler = new DOMLinkHandler(makeEngine(pages, former));
      await handler.initialize();
      return handler;
    }

    test('[My Links] is not a red link and goes to /view/', async () => {
      const handler = await init(['Pinned pages', 'Garden'], ['my links']);
      const doc = new DOMParser().parse('[My Links]', {});
      await handler.processLinks(doc, { pageName: 'Garden' });
      const html = doc.toHTML();
      expect(html).toContain('href="/view/My%20Links"');
      expect(html).toContain('class="wiki-link wikipage"');
      expect(html).not.toContain('redlink');
    });

    test('a name nobody held before is still a red link', async () => {
      const handler = await init(['Pinned pages', 'Garden'], ['my links']);
      const doc = new DOMParser().parse('[Never Existed]', {});
      await handler.processLinks(doc, { pageName: 'Garden' });
      const html = doc.toHTML();
      expect(html).toContain('href="/edit/Never%20Existed"');
      expect(html).toContain('redlink');
    });

    test('is found again after the page list is refreshed', async () => {
      const handler = await init(['Garden'], []);
      (handler as unknown as { pageManager: unknown }).pageManager = makeEngine(['Pinned pages', 'Garden'], ['my links']).getManager('PageManager');
      await handler.refreshPageNames();
      const doc = new DOMParser().parse('[My Links]', {});
      await handler.processLinks(doc, { pageName: 'Garden' });
      expect(doc.toHTML()).not.toContain('redlink');
    });
  });
});
