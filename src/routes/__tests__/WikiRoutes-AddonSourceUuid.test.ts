/**
 * @file WikiRoutes-AddonSourceUuid.test.ts
 * @description #964 — an addon page's identity is its frontmatter uuid, never
 * its source filename.
 *
 * The admin Required Pages Sync tool derived the uuid from the filename. For an
 * addon shipping `geohazardwatch-hans.md` that produced the fake identity
 * "geohazardwatch-hans", compared it against `data/pages/geohazardwatch-hans.md`
 * — a path that never exists — so the page showed as `new` forever and syncing
 * wrote a duplicate under the wrong filename.
 *
 * It went unnoticed because the four bundled addons all use uuid filenames, so
 * filename and identity happen to coincide there. Per addons.md §10, slug
 * filenames are the CORRECT convention for addon source, which is exactly the
 * case that was broken.
 */
import matter from 'gray-matter';

const REAL_UUID = '4bf246b9-ebcc-4774-8175-427c275d407c';

const page = (data: Record<string, unknown>) => matter.stringify('page body', data);

describe('#964 addon source uuid resolution', () => {
  let addonSourceUuid: (s: string) => string;

  beforeEach(async () => {
    const mod = await import('../WikiRoutes');
    const WikiRoutes = (mod.default ?? mod) as unknown as { addonSourceUuid(s: string): string };
    addonSourceUuid = WikiRoutes.addonSourceUuid.bind(WikiRoutes);
  });

  test('reads the uuid from frontmatter, ignoring the filename entirely', () => {
    // The slug-named case — the one that was broken.
    expect(addonSourceUuid(page({ uuid: REAL_UUID, slug: 'us-volcano-alerts-usgs-hans' }))).toBe(REAL_UUID);
  });

  test('does not confuse the slug for the uuid', () => {
    const resolved = addonSourceUuid(page({ uuid: REAL_UUID, slug: 'geohazardwatch-hans' }));
    expect(resolved).toBe(REAL_UUID);
    expect(resolved).not.toBe('geohazardwatch-hans');
  });

  test('returns empty when the page has no uuid', () => {
    // Mandatory and addon-owned (#951); with none there is nothing to compare
    // against, so the caller skips rather than inventing an identity.
    expect(addonSourceUuid(page({ slug: 'no-uuid-here', title: 'Orphan' }))).toBe('');
  });

  test('returns empty for a non-string uuid rather than coercing', () => {
    expect(addonSourceUuid(page({ uuid: 12345, slug: 'weird' }))).toBe('');
  });

  test('trims incidental whitespace', () => {
    expect(addonSourceUuid(`---\nuuid: "  ${REAL_UUID}  "\nslug: x\n---\nbody`)).toBe(REAL_UUID);
  });

  test('returns empty on unparseable frontmatter instead of throwing', () => {
    // A malformed vendor file must not take down the admin page.
    expect(addonSourceUuid('---\nuuid: [unclosed\n---\nbody')).toBe('');
    expect(addonSourceUuid('no frontmatter at all')).toBe('');
  });
});
