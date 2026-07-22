/**
 * MediaPlugin tests
 *
 * Covers:
 * - No engine → '0'
 * - No MediaManager → '0'
 * - format=count (default) → count string
 * - format=list → list of links
 * - format=album → thumbnail grid
 * - format=album-link → button, requires keyword
 * - keyword param (normal and 'current')
 * - page param (normal and 'current')
 * - year param → uses listByYear
 * - no params → aggregates all years
 * - max param limits results
 * - error handling → '0'
 *
 * @jest-environment node
 */

import MediaPlugin from '../MediaPlugin';

const makeItem = (id: string, filename: string, mimeType = 'image/jpeg', year = 2024) => ({
  id,
  filename,
  mimeType,
  year
});

const makeMediaManager = (overrides: Partial<{
  years: number[];
  byYear: Record<number, unknown[]>;
  byPage: Record<string, unknown[]>;
  byKeyword: Record<string, unknown[]>;
}> = {}) => ({
  getYears: vi.fn().mockResolvedValue(overrides.years ?? [2024]),
  listByYear: vi.fn(async (year: number) => overrides.byYear?.[year] ?? []),
  listByPage: vi.fn(async (page: string) => overrides.byPage?.[page] ?? []),
  listByKeyword: vi.fn(async (kw: string) => overrides.byKeyword?.[kw] ?? [])
});

// #901: slugify for the ValidationManager stub — matches generateSlug for ASCII.
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const makeEngine = (mediaManager: unknown = null, logger: unknown = null, withValidation = false) => ({
  getManager: vi.fn((name: string) => {
    if (name === 'MediaManager') return mediaManager;
    if (name === 'ValidationManager' && withValidation) return { generateSlug: slugify };
    return null;
  }),
  logger: logger ?? { error: vi.fn() }
});

describe('MediaPlugin', () => {
  describe('metadata', () => {
    test('has correct name and version', () => {
      expect(MediaPlugin.name).toBe('MediaPlugin');
      expect(MediaPlugin.version).toBe('1.2.0');
      expect(typeof MediaPlugin.execute).toBe('function');
    });
  });

  describe('early returns', () => {
    test('returns "0" when engine is null', async () => {
      const result = await MediaPlugin.execute({ engine: null }, {});
      expect(result).toBe('0');
    });

    test('returns "0" when MediaManager unavailable', async () => {
      const context = { engine: makeEngine(null) };
      const result = await MediaPlugin.execute(context, {});
      expect(result).toBe('0');
    });

    test('returns "0" when MediaManager has no getYears', async () => {
      const context = { engine: makeEngine({}) };
      const result = await MediaPlugin.execute(context, {});
      expect(result).toBe('0');
    });
  });

  describe('format=count (default)', () => {
    test('returns count of all items across all years', async () => {
      const mm = makeMediaManager({
        years: [2023, 2024],
        byYear: {
          2023: [makeItem('1', 'a.jpg'), makeItem('2', 'b.jpg')],
          2024: [makeItem('3', 'c.jpg')]
        }
      });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, {});
      expect(result).toContain('3');
    });

    test('returns "0" when no media items', async () => {
      const mm = makeMediaManager({ years: [2024], byYear: { 2024: [] } });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, {});
      expect(result).toContain('0');
    });

    test('returns "0" when no years', async () => {
      const mm = makeMediaManager({ years: [] });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, {});
      expect(result).toContain('0');
    });
  });

  describe('format=list', () => {
    test('returns list of media item links', async () => {
      const items = [makeItem('1', 'photo.jpg'), makeItem('2', 'video.mp4', 'video/mp4')];
      const mm = makeMediaManager({ years: [2024], byYear: { 2024: items } });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, { format: 'list' });
      expect(result).toContain('photo.jpg');
      expect(result).toContain('video.mp4');
      expect(result).toContain('/media/item/');
    });

    test('max param limits list results', async () => {
      const items = Array.from({ length: 10 }, (_, i) => makeItem(String(i), `img${i}.jpg`));
      const mm = makeMediaManager({ years: [2024], byYear: { 2024: items } });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, { format: 'list', max: '3' });
      const count = (result.match(/media\/item\//g) ?? []).length;
      expect(count).toBeLessThanOrEqual(3);
    });
  });

  describe('format=album', () => {
    test('renders thumbnail grid', async () => {
      const items = [makeItem('1', 'photo.jpg', 'image/jpeg')];
      const mm = makeMediaManager({ years: [2024], byYear: { 2024: items } });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, { format: 'album' });
      expect(result).toContain('media-plugin-album');
      expect(result).toContain('media/thumb/');
    });

    test('shows no media message when empty', async () => {
      const mm = makeMediaManager({ years: [2024], byYear: { 2024: [] } });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, { format: 'album' });
      expect(result).toContain('No media items found');
    });

    test('renders video icon for video items', async () => {
      const items = [makeItem('v1', 'movie.mp4', 'video/mp4')];
      const mm = makeMediaManager({ years: [2024], byYear: { 2024: items } });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, { format: 'album' });
      expect(result).toContain('fa-film');
    });

    test('renders file icon for non-image/video items', async () => {
      const items = [makeItem('d1', 'doc.pdf', 'application/pdf')];
      const mm = makeMediaManager({ years: [2024], byYear: { 2024: items } });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, { format: 'album' });
      expect(result).toContain('fa-file');
    });
  });

  describe('format=album-link', () => {
    test('renders button link for keyword album', async () => {
      const items = [makeItem('1', 'photo.jpg')];
      const mm = makeMediaManager({ byKeyword: { dogs: items } });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, { format: 'album-link', keyword: 'dogs' });
      expect(result).toContain('media/keyword/dogs');
      expect(result).toContain('dogs Album');
    });

    test('returns error when no keyword param', async () => {
      const mm = makeMediaManager();
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, { format: 'album-link' });
      expect(result).toContain('album-link requires a keyword=');
    });

    test('includes item count in button label', async () => {
      const items = [makeItem('1', 'a.jpg'), makeItem('2', 'b.jpg')];
      const mm = makeMediaManager({ byKeyword: { cats: items } });
      const context = { engine: makeEngine(mm) };
      const result = await MediaPlugin.execute(context, { format: 'album-link', keyword: 'cats' });
      expect(result).toContain('2 items');
    });
  });

  describe('keyword param', () => {
    test('uses listByKeyword when keyword specified', async () => {
      const items = [makeItem('1', 'rocket.jpg')];
      const mm = makeMediaManager({ byKeyword: { rockets: items } });
      const context = { engine: makeEngine(mm) };
      await MediaPlugin.execute(context, { keyword: 'rockets' });
      expect(mm.listByKeyword).toHaveBeenCalledWith('rockets');
    });

    test('keyword=current resolves to pageName', async () => {
      const items = [makeItem('1', 'local.jpg')];
      const mm = makeMediaManager({ byKeyword: { CurrentPage: items } });
      const context = { engine: makeEngine(mm), pageName: 'CurrentPage' };
      await MediaPlugin.execute(context, { keyword: 'current' });
      expect(mm.listByKeyword).toHaveBeenCalledWith('CurrentPage');
    });

    // #901: 'current' picks whichever form (name or slug) actually has media.
    test('keyword=current picks NAME form when name-tagged media dominates', async () => {
      const mm = makeMediaManager({ byKeyword: {
        'Dining': [makeItem('1', 'a'), makeItem('2', 'b'), makeItem('3', 'c')],
        'dining': [makeItem('9', 'z')]
      } });
      const context = { engine: makeEngine(mm, null, true), pageName: 'Dining' };
      const out = await MediaPlugin.execute(context, { keyword: 'current', format: 'album-link' });
      expect(out).toContain('Dining Album (3 items)');
    });

    test('keyword=current picks SLUG form when slug-tagged media dominates (multi-word page)', async () => {
      const mm = makeMediaManager({ byKeyword: {
        '2026 trip west': [makeItem('1', 'stray')],
        '2026-trip-west': Array.from({ length: 5 }, (_, i) => makeItem(String(i), `m${i}`))
      } });
      const context = { engine: makeEngine(mm, null, true), pageName: '2026 trip west' };
      const out = await MediaPlugin.execute(context, { keyword: 'current', format: 'album-link' });
      expect(out).toContain('2026-trip-west Album (5 items)');
    });

    test('keyword=current falls back to name form on a tie / both empty', async () => {
      const mm = makeMediaManager({ byKeyword: {} });
      const context = { engine: makeEngine(mm, null, true), pageName: 'Nothing Here' };
      const out = await MediaPlugin.execute(context, { keyword: 'current', format: 'album-link' });
      expect(out).toContain('Nothing Here Album (0 items)');
    });
  });

  describe('page param', () => {
    test('uses listByPage when page specified', async () => {
      const items = [makeItem('1', 'linked.jpg')];
      const mm = makeMediaManager({ byPage: { AboutPage: items } });
      const context = { engine: makeEngine(mm) };
      await MediaPlugin.execute(context, { page: 'AboutPage' });
      expect(mm.listByPage).toHaveBeenCalledWith('AboutPage');
    });

    test('page=current resolves to pageName', async () => {
      const items = [makeItem('1', 'local.jpg')];
      const mm = makeMediaManager({ byPage: { WikiHome: items } });
      const context = { engine: makeEngine(mm), pageName: 'WikiHome' };
      await MediaPlugin.execute(context, { page: 'current' });
      expect(mm.listByPage).toHaveBeenCalledWith('WikiHome');
    });
  });

  describe('year param', () => {
    test('uses listByYear when year specified', async () => {
      const items = [makeItem('1', '2023.jpg')];
      const mm = makeMediaManager({ byYear: { 2023: items } });
      const context = { engine: makeEngine(mm) };
      await MediaPlugin.execute(context, { year: '2023' });
      expect(mm.listByYear).toHaveBeenCalledWith(2023);
    });
  });

  describe('error handling', () => {
    test('returns "0" on unexpected error', async () => {
      const brokenMm = {
        getYears: vi.fn().mockRejectedValue(new Error('DB down'))
      };
      const context = { engine: makeEngine(brokenMm) };
      const result = await MediaPlugin.execute(context, {});
      expect(result).toBe('0');
    });
  });
});
