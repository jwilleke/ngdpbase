/**
 * #2457 — `fix-page-markdown --apply` saves each page on its own, and names
 * every page whose save was refused, with the reason.
 *
 * `fixPages` is handed a fake save, so no engine boots. The refusing save in
 * the last test runs the same HTML-policy check the engine's save runs
 * (src/parsers/filters/SecurityFilter.ts).
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixPages } from '../fix-page-markdown';
import { jspwikiLinkLeftovers } from '../../src/converters/ncm/fix/jspwikiLinkLeftovers';
import { authorHtmlIn } from '../../src/rendering/markdownConverter';
import { asHtmlPolicy, htmlPolicyViolations } from '../../src/rendering/htmlPolicy';
import { shippedHtmlPolicy } from '../../src/rendering/__tests__/__fixtures__/shippedHtmlPolicy';

const OPTIONS = { steps: ['jspwiki-link-leftovers'] };
const DOUBLED = 'See https://example.com/a(https://example.com/a) here';
const SPLIT_LINK = "[Regex (?<name>X) groups\n|https://example.com/regex|target='_blank']";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fix2457-'));
});
afterEach(async () => {
  await fs.remove(dir);
});

async function page(title: string, body: string): Promise<string> {
  const file = path.join(dir, `${title.replace(/\W+/g, '-')}.md`);
  await fs.writeFile(file, `---\ntitle: ${title}\nauthor: admin\n---\n${body}\n`, 'utf8');
  return file;
}

/** The message the engine's save gives for text the HTML policy refuses. */
function policyRefusal(title: string, content: string): Error | null {
  const policy = asHtmlPolicy(shippedHtmlPolicy);
  const reasons = authorHtmlIn(content).flatMap((h) => htmlPolicyViolations(h.html, policy).map((v) => v.message));
  return reasons.length ? new Error(`Content validation failed for "${title}": ${reasons.join('; ')}`) : null;
}

describe('fixPages: --apply saves each page on its own', () => {
  it('saves the second page when the first page\'s save is refused', async () => {
    const a = await page('Alpha', DOUBLED);
    const b = await page('Bravo', DOUBLED);
    const saved: string[] = [];
    const save = async (title: string): Promise<void> => {
      if (title === 'Alpha') throw new Error('Content validation failed for "Alpha": The <name> tag is not allowed in page content');
      saved.push(title);
    };

    const result = await fixPages([a, b], dir, OPTIONS, save, () => {});

    expect(saved).toEqual(['Bravo']);
    expect(result.changes.map((c) => c.title)).toEqual(['Bravo']);
    expect(result.failed.map((f) => f.title)).toEqual(['Alpha']);
  });

  it('names each refused page and why, through the log', async () => {
    const a = await page('Alpha', DOUBLED);
    const b = await page('Bravo', DOUBLED);
    const save = async (title: string): Promise<void> => {
      if (title === 'Alpha') throw new Error('The <name> tag is not allowed in page content');
    };
    const lines: string[] = [];

    await fixPages([a, b], dir, OPTIONS, save, (line) => lines.push(line));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Alpha');
    expect(lines[0]).toContain('The <name> tag is not allowed in page content');
    expect(lines.join('\n')).not.toContain('Bravo');
  });

  it('logs nothing when every save works, and on a dry run', async () => {
    const a = await page('Alpha', DOUBLED);
    const lines: string[] = [];

    await fixPages([a], dir, OPTIONS, async () => {}, (line) => lines.push(line));
    await fixPages([a], dir, OPTIONS, null, (line) => lines.push(line));

    expect(lines).toEqual([]);
  });
});

describe('fixPages: a page shaped like Regular Expression Syntax (#2457)', () => {
  it('the join adds nothing the HTML policy refuses: the page already carries it', () => {
    const joined = jspwikiLinkLeftovers.apply(SPLIT_LINK);
    expect(joined.content).toBe("[Regex (?<name>X) groups|https://example.com/regex|target='_blank']");

    const reasons = (text: string): string[] => {
      const policy = asHtmlPolicy(shippedHtmlPolicy);
      return authorHtmlIn(text).flatMap((h) => htmlPolicyViolations(h.html, policy).map((v) => v.message));
    };
    expect(reasons(SPLIT_LINK)).toEqual(['The <name> tag is not allowed in page content']);
    expect(reasons(joined.content)).toEqual(reasons(SPLIT_LINK));
  });

  it('is left as it was, reported by name with the tag the policy refused, while the next page is saved', async () => {
    const regex = await page('Regular Expression Syntax', SPLIT_LINK);
    const clean = await page('Thing', DOUBLED);
    const written: Record<string, string> = {};
    const save = async (title: string, content: string): Promise<void> => {
      const refusal = policyRefusal(title, content);
      if (refusal) throw refusal;
      written[title] = content;
    };
    const lines: string[] = [];

    const result = await fixPages([regex, clean], dir, OPTIONS, save, (line) => lines.push(line));

    expect(Object.keys(written)).toEqual(['Thing']);
    expect(result.failed.map((f) => f.title)).toEqual(['Regular Expression Syntax']);
    expect(lines.join('\n')).toContain('Regular Expression Syntax');
    expect(lines.join('\n')).toContain('The <name> tag is not allowed in page content');
    expect(await fs.readFile(regex, 'utf8')).toContain(SPLIT_LINK);
  });
});
