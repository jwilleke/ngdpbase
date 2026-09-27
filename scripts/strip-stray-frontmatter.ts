#!/usr/bin/env tsx
/**
 * Remove the form fields earlier editor saves stored as frontmatter (#1353):
 * the editor's `baseLastModified` token and a browser extension's
 * `web_form_*` fields. A save already drops them, so a page sheds them the
 * next time anyone edits it; this is for the pages nobody has edited since.
 *
 * By default a DRY RUN: reads page files, writes nothing, and reports every
 * page that would change and which fields it would lose.
 *
 * With `--apply` it writes each changed page through PageManager as one
 * version by the system principal, keeping the page's `lastModified`, with
 * its body untouched. It refuses to run while the server is up, so stop it
 * first (`./server.sh stop <env>`) and start it after. Private pages are
 * reported and never written: a store page needs its owner's keys.
 *
 * Usage:
 *   npx tsx scripts/strip-stray-frontmatter.ts --data /path/to/pages [--report private/stray-frontmatter.md]
 *   npx tsx scripts/strip-stray-frontmatter.ts --data /path/to/pages --apply
 */

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { isStrayFormField } from '../src/utils/strayFormFields.js';
import { isPrivatePageFile, openSaveThroughDoor, pageFiles } from './lib/pageMigration.js';

interface Found { title: string; file: string; fields: string[]; isPrivate: boolean }

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const apply = argv.includes('--apply');
  const dataDir = get('--data');
  if (!dataDir || !(await fs.pathExists(dataDir))) {
    console.error('✗ --data <page store directory> is required and must exist');
    process.exit(1);
  }
  const reportPath = get('--report') ?? `private/stray-frontmatter-${apply ? 'applied' : 'dry-run'}.md`;
  const save = apply ? await openSaveThroughDoor(dataDir, 'Strip stray form fields from frontmatter (#1353)') : null;

  const files = (await pageFiles(dataDir)).sort();
  const found: Found[] = [];
  const skippedPrivate: string[] = [];
  const failed: Array<{ title: string; error: string }> = [];
  const fieldCounts = new Map<string, number>();

  for (const file of files) {
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(await fs.readFile(file, 'utf8'));
    } catch {
      continue; // unparseable frontmatter is a page problem, not this migration's
    }
    const data = parsed.data as Record<string, unknown>;
    const stray = Object.keys(data).filter(isStrayFormField);
    if (!stray.length) continue;
    const title = String(data['title'] ?? path.basename(file, '.md'));
    const isPrivate = isPrivatePageFile(dataDir, file, data);
    if (save && isPrivate) {
      skippedPrivate.push(title);
      continue;
    }
    if (save) {
      const cleaned = Object.fromEntries(Object.entries(data).filter(([k]) => !isStrayFormField(k)));
      try {
        if (!data['title']) throw new Error('page has no title');
        await save(title, parsed.content, cleaned);
      } catch (err) {
        failed.push({ title, error: err instanceof Error ? err.message : String(err) });
        continue;
      }
    }
    for (const kind of new Set(stray.map((f) => (f.startsWith('web_form_') ? 'web_form_*' : f)))) {
      fieldCounts.set(kind, (fieldCounts.get(kind) ?? 0) + 1);
    }
    found.push({ title, file: path.relative(dataDir, file), fields: stray, isPrivate });
  }

  const privateCount = found.filter((f) => f.isPrivate).length;
  const out: string[] = [
    `# Stray frontmatter fields: ${apply ? 'applied' : 'dry run'}`,
    '',
    `Corpus: \`${dataDir}\`. Generated ${new Date().toISOString()}. ${apply ? 'Public pages were saved through PageManager as one version each by the system principal, keeping lastModified; bodies unchanged. Private pages were not written.' : 'Nothing was written.'}`,
    '',
    `- Pages scanned: ${files.length}`,
    `- Pages ${apply ? 'changed' : 'that would change'}: ${found.length}`,
    ...[...fieldCounts].map(([k, n]) => `  - with \`${k}\`: ${n}`),
    `- Private pages among them: ${privateCount}${apply ? '' : ' (--apply leaves them alone)'}`,
    ...(apply ? [`- Private pages not written: ${skippedPrivate.length}`, `- Failed: ${failed.length}`] : []),
    '',
    '## Pages',
    '',
    ...found.map((f) => `- ${f.title}${f.isPrivate ? ' (private)' : ''}: ${f.fields.join(', ')}`)
  ];
  if (failed.length) out.push('', '## Failed', '', ...failed.map((f) => `- ${f.title}: ${f.error}`));
  out.push('');
  await fs.ensureDir(path.dirname(reportPath));
  await fs.writeFile(reportPath, out.join('\n'), 'utf8');

  console.log(`Scanned ${files.length} pages: ${found.length} ${apply ? 'changed' : 'would change'} (${[...fieldCounts].map(([k, n]) => `${k} ${n}`).join(', ')}); ${privateCount} private.${apply ? ` Private skipped: ${skippedPrivate.length}. Failed: ${failed.length}.` : ''}`);
  console.log(`Report: ${reportPath}`);
  if (apply) process.exit(failed.length ? 1 : 0);
}

void main();
