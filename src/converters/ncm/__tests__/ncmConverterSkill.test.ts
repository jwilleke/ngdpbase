/**
 * The portable NCM conversion skill stays true to the code (#1475).
 *
 * `skills/ncm-converter/SKILL.md` is handed to agents outside this repo, which
 * copy its examples. So every NCM example in it must be NCM by this code's own
 * definition — or the skill teaches a construct the site refuses or rewrites,
 * and nothing notices until pages come out wrong:
 *
 *   - it passes the save-time content checks (SecurityFilter.collectErrors);
 *   - it is a fixed point of the NCM funnel: the normalizer and every fix step
 *     leave its body exactly as written.
 *
 * What it RENDERS as was checked against a live instance's /api/preview when
 * the skill was written; this guard keeps the examples valid as the code moves.
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { normalizeToNcm } from '../index';
import { runFixes } from '../fix/index';
import SecurityFilter from '../../../parsers/filters/SecurityFilter';

const SKILL = path.resolve(__dirname, '../../../../skills/ncm-converter/SKILL.md');
const text = fs.readFileSync(SKILL, 'utf8');

/** Every fenced block labelled `ncm`, whatever its fence length. */
const examples = [...text.matchAll(/^(`{3,})ncm\n([\s\S]*?)\n\1$/gm)].map(m => m[2]);

describe('skills/ncm-converter/SKILL.md (#1475)', () => {
  test('is a valid Agent Skill: a lowercase name and a description', () => {
    const { data } = matter(text);
    expect(data.name).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(typeof data.description).toBe('string');
    expect((data.description as string).length).toBeGreaterThan(0);
    expect((data.description as string).length).toBeLessThanOrEqual(1024);
  });

  test('has examples to check', () => {
    expect(examples.length).toBeGreaterThanOrEqual(2);
  });

  test.each(examples.map((e, i) => [i, e]))('example %i passes the checks a save runs', async (_i, example) => {
    const errors = await new SecurityFilter().collectErrors(example);
    expect(errors).toEqual([]);
  });

  test.each(examples.map((e, i) => [i, e]))('example %i is left exactly as written by the NCM funnel', (_i, example) => {
    const body = matter(example).content.trim();

    const normalized = matter(normalizeToNcm(body, 'markdown', {}).content).content.trim();
    expect(normalized).toBe(body);
    expect(runFixes(body).content.trim()).toBe(body);
  });

  test('the complete example sets only the frontmatter an author may', () => {
    const complete = examples.find(e => e.startsWith('---\n'));
    expect(complete).toBeDefined();
    const keys = Object.keys(matter(complete ?? '').data);
    expect(keys.every(k => ['title', 'user-keywords', 'system-category'].includes(k))).toBe(true);
  });
});
