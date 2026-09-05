/**
 * PageSlideshowPlugin tests
 *
 * Covers:
 * - No PageManager → error message
 * - No pages/random params → error
 * - Explicit pages: all null → "no accessible pages"
 * - Explicit pages: renders carousel
 * - random parameter → uses listPagesFor (#1219) + shuffleArray
 * - showTitle/showLink/controls/indicators flags
 * - interval=0 disables autoplay
 * - height/cssclass params
 *
 * @jest-environment node
 */

import PageSlideshowPlugin from '../PageSlideshowPlugin';

/** `allPages` is what the viewer may read (#1219); `denied` are pages that exist but the evaluator refuses. */
const makePageManager = (allPages: string[] = [], pages: Record<string, unknown> = {}) => ({
  getAllPages: vi.fn().mockResolvedValue(allPages),
  listPagesFor: vi.fn().mockResolvedValue(allPages),
  getPage: vi.fn(async (name: string) => pages[name] ?? null)
});

let denied: string[] = [];
const makeEngine = (pageManager: unknown = null) => ({
  getManager: vi.fn((name: string) =>
    name === 'PageManager' ? pageManager
      : name === 'ACLManager' ? { canUserAccessPage: vi.fn(async (_u: unknown, page: string) => !denied.includes(page)) }
        : null)
});
beforeEach(() => { denied = []; });

const samplePage = (title = 'Test Page', content = 'Some content about the topic here.') => ({
  title,
  content,
  rawContent: content
});

describe('PageSlideshowPlugin', () => {
  describe('metadata', () => {
    test('has correct name and version', () => {
      expect(PageSlideshowPlugin.name).toBe('PageSlideshowPlugin');
      expect(PageSlideshowPlugin.version).toBe('1.0.0');
      expect(typeof PageSlideshowPlugin.execute).toBe('function');
    });
  });

  describe('no PageManager', () => {
    test('returns error when PageManager unavailable', async () => {
      const context = { engine: makeEngine(null) };
      const result = await PageSlideshowPlugin.execute(context, {});
      expect(result).toContain('PageManager unavailable');
    });

    test('returns error when engine is null', async () => {
      const context = { engine: null };
      const result = await PageSlideshowPlugin.execute(context, {});
      expect(result).toContain('PageManager unavailable');
    });
  });

  describe('missing params', () => {
    test('returns error when no pages or random specified', async () => {
      const pm = makePageManager();
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, {});
      expect(result).toContain('specify pages or random parameter');
    });
  });

  describe('explicit pages', () => {
    test('renders carousel with accessible pages', async () => {
      const pm = makePageManager([], { RocketPage: samplePage('Rocket Engines') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'RocketPage' });
      expect(result).toContain('carousel');
      expect(result).toContain('Rocket Engines');
    });

    test('first slide has active class', async () => {
      const pm = makePageManager([], {
        Page1: samplePage('Page One'),
        Page2: samplePage('Page Two')
      });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'Page1,Page2' });
      expect(result).toContain('carousel-item active');
    });

    test('shows "no accessible pages" when all pages return null', async () => {
      const pm = makePageManager([], {});
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'Missing1,Missing2' });
      expect(result).toContain('no accessible pages found');
    });

    test('skips null pages silently', async () => {
      const pm = makePageManager([], { AccessiblePage: samplePage('Accessible') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'MissingPage,AccessiblePage' });
      expect(result).toContain('Accessible');
      expect(result).not.toContain('MissingPage');
    });

    test('includes Read more link by default', async () => {
      const pm = makePageManager([], { TestPage: samplePage('Test') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TestPage' });
      expect(result).toContain('Read more');
    });

    test('includes indicator dots by default', async () => {
      const pm = makePageManager([], { TestPage: samplePage('Test') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TestPage' });
      expect(result).toContain('carousel-indicators');
    });

    test('includes control buttons by default', async () => {
      const pm = makePageManager([], { TestPage: samplePage('Test') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TestPage' });
      expect(result).toContain('carousel-control-prev');
      expect(result).toContain('carousel-control-next');
    });
  });

  describe('random parameter', () => {
    test('#1219: a named page the evaluator refuses is not a slide', async () => {
      const pm = makePageManager(['Public'], { Public: samplePage('Public'), Secret: samplePage('Secret', 'the secret text') });
      denied = ['Secret'];
      const html = await PageSlideshowPlugin.execute({ engine: makeEngine(pm) }, { pages: 'Public,Secret' });
      expect(html).toContain('Public');
      expect(html).not.toContain('secret text');
      expect(pm.getPage).not.toHaveBeenCalledWith('Secret');
    });

    test('uses the listing door when random is set', async () => {
      const pm = makePageManager(
        ['Page1', 'Page2', 'Page3'],
        { Page1: samplePage('P1'), Page2: samplePage('P2'), Page3: samplePage('P3') }
      );
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { random: '2' });
      expect(pm.listPagesFor).toHaveBeenCalled();
      expect(result).toContain('carousel');
    });

    test('clamps random to minimum 1', async () => {
      const pm = makePageManager(['P1'], { P1: samplePage('P1') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { random: '0' });
      expect(pm.listPagesFor).toHaveBeenCalled();
      expect(result).toContain('carousel');
    });
  });

  describe('display flags', () => {
    test('showTitle=false hides page titles', async () => {
      const pm = makePageManager([], { TitlePage: samplePage('My Title') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TitlePage', showTitle: 'false' });
      expect(result).not.toContain('My Title');
    });

    test('showLink=false hides Read more', async () => {
      const pm = makePageManager([], { TestPage: samplePage('Test') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TestPage', showLink: 'false' });
      expect(result).not.toContain('Read more');
    });

    test('controls=false hides prev/next buttons', async () => {
      const pm = makePageManager([], { TestPage: samplePage('Test') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TestPage', controls: 'false' });
      expect(result).not.toContain('carousel-control-prev');
    });

    test('indicators=false hides dots', async () => {
      const pm = makePageManager([], { TestPage: samplePage('Test') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TestPage', indicators: 'false' });
      expect(result).not.toContain('carousel-indicators');
    });
  });

  describe('interval parameter', () => {
    test('interval=0 disables autoplay', async () => {
      const pm = makePageManager([], { TestPage: samplePage('Test') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TestPage', interval: '0' });
      expect(result).toContain('data-bs-ride="false"');
    });

    test('positive interval enables autoplay', async () => {
      const pm = makePageManager([], { TestPage: samplePage('Test') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TestPage', interval: '3000' });
      expect(result).toContain('data-bs-ride="carousel"');
      expect(result).toContain('data-bs-interval="3000"');
    });
  });

  describe('css options', () => {
    test('height param sets min-height style', async () => {
      const pm = makePageManager([], { TestPage: samplePage('Test') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TestPage', height: '400px' });
      expect(result).toContain('min-height:400px');
    });

    test('cssclass appends extra class', async () => {
      const pm = makePageManager([], { TestPage: samplePage('Test') });
      const context = { engine: makeEngine(pm) };
      const result = await PageSlideshowPlugin.execute(context, { pages: 'TestPage', cssclass: 'my-custom-class' });
      expect(result).toContain('my-custom-class');
    });
  });
});
