/**
 * The two help pages slice 3 of #2247 changes: "Share Links" becomes "Shared
 * links" and "Your Consents" points at it. Both go out through Required Pages
 * Sync, so each needs a newer lastModified than v5.46.0 shipped.
 */

import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname, '../../../required-pages');
const read = (prefix: string) => fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.startsWith(prefix))), 'utf8');

describe('shared links help pages (slice 3 of #2247)', () => {
  const links = read('d428a9ed');
  const consents = read('06c1cba1');

  test('"Share Links" is retitled "Shared links", keeps its slug and answers to the old title', () => {
    expect(links).toMatch(/^title: Shared links$/m);
    expect(links).toMatch(/^slug: share-links$/m);
    expect(links).toMatch(/formerTitles:\n {2}- Share Links/);
    expect(links).toMatch(/^lastModified: '2026-11-26/m);
  });

  test('"Shared links" says who may stop anyone\'s link, by permission, not on the old /shares page (slice 4)', () => {
    expect(links).not.toContain('A system administrator can revoke anyone');
    expect(links).not.toContain('on `/shares`');
    expect(links).toContain("See and revoke everyone's shared links");
    expect(links).toMatch(/## All users/);
    expect(links).toMatch(/administrators by default/);
    expect(links).toMatch(/Page not available \(404\)/);
    expect(links).not.toMatch(/—/);
  });

  test('"Shared links" describes the one page, its kinds and the maker\'s revoke', () => {
    expect(links).toContain('/my/shares');
    expect(links).toMatch(/Everything with a tag/);
    expect(links).toMatch(/private area/);
    expect(links).toMatch(/Page not available/);
    expect(links).not.toMatch(/—/);
  });

  test('"Your Consents" points at the Shared links page', () => {
    expect(consents).toContain('Shared links');
    expect(consents).not.toContain('Share Links page');
    expect(consents).toMatch(/^lastModified: '2026-11-25/m);
  });
});
