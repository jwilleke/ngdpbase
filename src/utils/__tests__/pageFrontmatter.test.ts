/**
 * Page names are text, whatever YAML makes of them — #1381.
 */
import { parsePageFrontmatter, namesAsText, nameAsText } from '../pageFrontmatter';

const page = (fm: string) => `---\n${fm}\n---\nBody\n`;

describe('parsePageFrontmatter (#1381)', () => {
  test.each([
    ['title: true', 'true'],
    ['title: false', 'false'],
    ['title: 2024-11-21', '2024-11-21'],
    ['title: 2024-11-21T00:00:00.000Z', '2024-11-21T00:00:00.000Z'],
    ['title: 2024', '2024'],
    ['title: 1.50', '1.50'],
    ['title: null', undefined],
    ["title: 'true'", 'true'],
    ['title: Plain Title', 'Plain Title']
  ])('%s gives title %p', (fm, expected) => {
    expect(parsePageFrontmatter(page(fm)).data.title).toBe(expected ?? null);
  });

  test('slug, uuid and the name lists come back as written', () => {
    const { data } = parsePageFrontmatter(page([
      'title: true',
      'slug: true',
      'uuid: 12345',
      'aliases:',
      '  - true',
      '  - Truth',
      'formerTitles:',
      '  - 2024-11-21'
    ].join('\n')));
    expect(data).toMatchObject({ title: 'true', slug: 'true', uuid: '12345', aliases: ['true', 'Truth'], formerTitles: ['2024-11-21'] });
  });

  test('other fields keep their YAML types', () => {
    const { data, content } = parsePageFrontmatter(page([
      'title: 2024-11-21',
      'private: true',
      'currentVersion: 3',
      'created: 2026-02-24T17:24:04.652Z'
    ].join('\n')));
    expect(data.private).toBe(true);
    expect(data.currentVersion).toBe(3);
    expect(data.created).toBeInstanceOf(Date);
    expect(content).toBe('Body\n');
  });

  test('a later plain parse of the same text still sees what YAML said', async () => {
    const raw = page('title: true');
    parsePageFrontmatter(raw);
    const matter = (await import('gray-matter')).default;
    expect(matter(raw).data.title).toBe(true);
  });
});

describe('namesAsText (#1381)', () => {
  test('already-parsed metadata: a Date title becomes its ISO text, a boolean its word', () => {
    const md = namesAsText({ title: new Date('2024-11-21T00:00:00.000Z'), slug: true, aliases: [true, 'x'], private: true });
    expect(md).toEqual({ title: '2024-11-21T00:00:00.000Z', slug: 'true', aliases: ['true', 'x'], private: true });
  });

  test('nameAsText leaves objects alone', () => {
    expect(nameAsText({ a: 1 })).toBeUndefined();
    expect(nameAsText(new Date('nope'))).toBeUndefined();
  });
});
