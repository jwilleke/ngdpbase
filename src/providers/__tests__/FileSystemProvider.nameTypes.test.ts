/**
 * A page whose YAML title is a boolean or a date — #1381.
 *
 * Imported pages were written as `title: true` and `title: 2024-11-21`. YAML
 * reads those as a boolean and a Date: the page was listed under
 * "Wed Nov 20 2024 19:00:00 GMT-0500…", and saving it threw
 * `title.toLowerCase is not a function`.
 */
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import matter from 'gray-matter';
import FileSystemProvider from '../FileSystemProvider';

vi.unmock('../FileSystemProvider');

let TEST_DIR: string;
let PAGES: string;

const engine = () => ({
  getManager: (name: string) => name === 'ConfigurationManager'
    ? {
      getProperty: (key: string, def: unknown) => ({
        'ngdpbase.page.provider.filesystem.storagedir': PAGES,
        'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(TEST_DIR, 'required-pages'),
        'ngdpbase.page.provider.filesystem.encoding': 'utf-8'
      } as Record<string, unknown>)[key] ?? def,
      getResolvedDataPath: (key: string, def: unknown) => (key === 'ngdpbase.page.provider.filesystem.storagedir' ? PAGES : def),
      getInstanceDataFolder: () => TEST_DIR
    }
    : null
});

const write = (uuid: string, frontmatter: string) =>
  fs.writeFile(path.join(PAGES, `${uuid}.md`), `---\n${frontmatter}\nuuid: ${uuid}\n---\nBody\n`);

describe('FileSystemProvider: page names YAML reads as other types (#1381)', () => {
  beforeEach(async () => {
    TEST_DIR = path.join(os.tmpdir(), `fsp-1381-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    PAGES = path.join(TEST_DIR, 'pages');
    await fs.ensureDir(PAGES);
    await fs.ensureDir(path.join(TEST_DIR, 'required-pages'));
    await fs.writeFile(path.join(TEST_DIR, '.install-complete'), '');
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR); // this test's own temp dir only
  });

  test('a boolean or date title is listed and found by the text written', async () => {
    await write('u-true', 'title: true\nslug: true');
    await write('u-date', 'title: 2024-11-21');
    const provider = new FileSystemProvider(engine());
    await provider.initialize();

    const titles = await provider.getAllPages();
    expect(titles).toEqual(expect.arrayContaining(['true', '2024-11-21']));
    expect(titles.some((t: string) => t.includes('GMT'))).toBe(false);

    const page = await provider.getPage('2024-11-21');
    expect(page?.metadata?.title).toBe('2024-11-21');
    expect((await provider.getPage('true'))?.metadata?.slug).toBe('true');
  });

  test('saving one does not throw, and writes the names quoted', async () => {
    await write('u-date', 'title: 2024-11-21\nslug: 2024-11-21');
    const provider = new FileSystemProvider(engine());
    await provider.initialize();

    const page = await provider.getPage('2024-11-21');
    await provider.savePage('2024-11-21', 'Edited', page!.metadata);

    const raw = await fs.readFile(path.join(PAGES, 'u-date.md'), 'utf8');
    expect(matter(raw).data.title).toBe('2024-11-21');
    expect(matter(raw).data.slug).toBe('2024-11-21');
  });

  test('metadata parsed elsewhere with a Date title saves instead of throwing', async () => {
    await write('u-iso', "title: '2024-11-21T00:00:00.000Z'");
    const provider = new FileSystemProvider(engine());
    await provider.initialize();

    await expect(provider.savePage('2024-11-21T00:00:00.000Z', 'Edited', {
      uuid: 'u-iso',
      title: new Date('2024-11-21T00:00:00.000Z') as unknown as string
    })).resolves.toBeUndefined();

    const raw = await fs.readFile(path.join(PAGES, 'u-iso.md'), 'utf8');
    expect(matter(raw).data.title).toBe('2024-11-21T00:00:00.000Z');
  });
});
