/**
 * A site upgraded from v5.46.0 holds the old "Share Links" help page exactly
 * as that release shipped it. Required Pages Sync must offer the new one:
 * "Update ready", under the new title "Shared links" (slice 3 of #2247).
 */
import fs from 'fs';
import path from 'path';
import { shippedPageState, pageSourceHash } from '../addonPageSync';

const body = (raw: string) => raw.replace(/^---\n[\s\S]*?\n---\n/, '');
const title = (raw: string) => /^title: (.+)$/m.exec(raw)?.[1];
const dir = path.join(__dirname, '../../../required-pages');
const shipped = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.startsWith('d428a9ed'))), 'utf8');
const v546 = fs.readFileSync(path.join(__dirname, 'fixtures', 'share-links-v5.46.0.md'), 'utf8');

describe('a site upgraded from v5.46.0 (slice 3 of #2247)', () => {
  test('the unedited "Share Links" help page shows Update ready', () => {
    const state = shippedPageState({
      shippedBody: body(shipped),
      liveBody: body(v546),
      stamp: pageSourceHash(body(v546)),
      userModified: false
    });
    expect(state.state).toBe('update-ready');
  });

  test('the page being offered is titled "Shared links", and the page on the site is not', () => {
    expect(title(v546)).toBe('Share Links');
    expect(title(shipped)).toBe('Shared links');
  });

  test('a page already updated shows no update', () => {
    const state = shippedPageState({ shippedBody: body(shipped), liveBody: body(shipped), stamp: pageSourceHash(body(shipped)), userModified: false });
    expect(state.state).toBe('same-as-shipped');
  });
});
