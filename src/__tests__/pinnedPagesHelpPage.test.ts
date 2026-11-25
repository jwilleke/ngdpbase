/**
 * The "Pinned pages" help page (#2520, slice 1 of #2247).
 *
 * The page was called "My Links". Its slug stays, and the old title is kept as
 * a former title, so a link written as [My Links], or a bookmark to
 * /view/My%20Links, still finds it. The text says what it does in plain words.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { buildFormerTitleIndex } from '../utils/formerTitles';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'required-pages/36c9c6ed-986d-4ada-930b-67d7ee55b4c7.md');

async function load() {
  return matter(await fs.readFile(FILE, 'utf8'));
}

describe('the Pinned pages help page (#2520)', () => {
  test('a link or bookmark that still says "My Links" resolves to the renamed page', async () => {
    const { data } = await load();
    expect(data.formerTitles).toEqual(['My Links']);
    const index = buildFormerTitleIndex([{ title: data.title, formerTitles: data.formerTitles }]);
    expect(index.get('my links')).toBe('Pinned pages');
  });

  test('the old name is not a keyword, so no chip or "Share \'my links\'" menu item shows it', async () => {
    const { data } = await load();
    const keywords = (data['user-keywords'] as string[]).map((k) => k.toLowerCase());
    expect(keywords).not.toContain('my links');
    expect(keywords).toContain('pinned pages');
  });

  test('the first sentence says plainly what you can do', async () => {
    const { content } = await load();
    expect(content.trimStart().startsWith('You can pin pages to your sidebar for quick access.')).toBe(true);
  });

  test('the text has no em-dashes', async () => {
    const { content } = await load();
    expect(content).not.toContain('—');
  });

  test('the name is lower case in the middle of a sentence and capital only as a heading or title', async () => {
    const { content } = await load();
    const midSentence = content.match(/[a-z,;] (?:__)?Pinned pages/g);
    expect(midSentence).toBeNull();
    expect(content).toContain('__Add to pinned pages__');
    expect(content).toContain('__Remove from pinned pages__');
  });
});
