/**
 * Unit tests for AppHealthPlugin (#730) — orphan / broken / stale detection,
 * filters, formats, and graceful degradation.
 */

import { describe, it, expect } from 'vitest';
import AppHealthPlugin from '../../plugins/AppHealthPlugin';

type LinkGraph = Record<string, string[]>;

function makeContext(
  allPages: string[],
  linkGraph: LinkGraph,
  recentChanges: { title: string; lastModified: string }[] | null = []
) {
  return {
    engine: {
      getManager: (name: string) => {
        if (name === 'PageManager') {
          const pm: Record<string, unknown> = {
            getAllPages: async () => allPages
          };
          if (recentChanges !== null) {
            pm.getRecentChanges = async () => recentChanges;
          }
          return pm;
        }
        return null;
      }
    },
    pageName: 'TestPage',
    linkGraph
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe('AppHealthPlugin', () => {
  it('detects orphan pages (no inbound links)', async () => {
    // A links to B. B has an inbound link; A and C do not.
    const ctx = makeContext(['A', 'B', 'C'], { B: ['A'] });
    const html = await AppHealthPlugin.execute!(ctx, {});
    expect(html).toContain('Orphan pages (2)');
    expect(html).toContain('>A</a>');
    expect(html).toContain('>C</a>');
    expect(html).not.toMatch(/Orphan pages \(2\)[\s\S]*>B<\/a>/);
  });

  it('detects broken / undefined links (linked-to but missing)', async () => {
    const ctx = makeContext(['A'], { Ghost: ['A'] });
    const html = await AppHealthPlugin.execute!(ctx, { checks: 'broken' });
    expect(html).toContain('Broken / undefined links (1)');
    expect(html).toContain('href="/edit/Ghost"');
    expect(html).not.toContain('Orphan pages');
  });

  it('detects stale pages via getRecentChanges + staleDays', async () => {
    const ctx = makeContext(['Old', 'New'], {}, [
      { title: 'Old', lastModified: daysAgo(400) },
      { title: 'New', lastModified: daysAgo(2) }
    ]);
    const html = await AppHealthPlugin.execute!(ctx, { checks: 'stale', staleDays: '365' });
    expect(html).toContain('Stale pages (no edit in 365d) (1)');
    expect(html).toContain('>Old</a>');
    expect(html).not.toContain('>New</a>');
  });

  it('applies exclude regex', async () => {
    const ctx = makeContext(['Main', 'Lonely'], {});
    const html = await AppHealthPlugin.execute!(ctx, {
      checks: 'orphans',
      exclude: '^Main$'
    });
    expect(html).toContain('Orphan pages (1)');
    expect(html).toContain('>Lonely</a>');
    expect(html).not.toContain('>Main</a>');
  });

  it('format=count returns a one-line summary', async () => {
    const ctx = makeContext(['A', 'B'], { Ghost: ['A'] }, [
      { title: 'A', lastModified: daysAgo(500) },
      { title: 'B', lastModified: daysAgo(1) }
    ]);
    const html = await AppHealthPlugin.execute!(ctx, { format: 'count' });
    expect(html).toContain('Orphans: 2');
    expect(html).toContain('Broken links: 1');
    expect(html).toContain('Stale: 1');
  });

  it('staleDays=0 disables the stale check', async () => {
    const ctx = makeContext(['A'], {}, [{ title: 'A', lastModified: daysAgo(999) }]);
    const html = await AppHealthPlugin.execute!(ctx, {
      checks: 'stale',
      staleDays: '0'
    });
    expect(html).toContain('Skipped');
    expect(html).not.toContain('(1)');
  });

  it('degrades when getRecentChanges is unavailable', async () => {
    const ctx = makeContext(['A'], {}, null); // no getRecentChanges on PageManager
    const html = await AppHealthPlugin.execute!(ctx, { checks: 'stale' });
    expect(html).toContain('Skipped');
  });

  it('errors clearly when PageManager is missing', async () => {
    const ctx = {
      engine: { getManager: () => null },
      pageName: 'X',
      linkGraph: {}
    };
    const html = await AppHealthPlugin.execute!(ctx, {});
    expect(html).toContain('PageManager not available');
  });

  it('caps each section at max', async () => {
    const pages = Array.from({ length: 10 }, (_, i) => `Orphan${i}`);
    const ctx = makeContext(pages, {});
    const html = await AppHealthPlugin.execute!(ctx, {
      checks: 'orphans',
      max: '3'
    });
    expect(html).toContain('Orphan pages (10)'); // count reflects true total
    expect((html.match(/<li>/g) || []).length).toBe(3); // but only max rendered
  });
});

describe('#1116 stale check supplies viewer facts, not an includeAll conclusion', () => {
  function makeSpyContext(userContext?: { username?: string; roles?: string[] }) {
    const calls: Array<Record<string, unknown>> = [];
    return {
      calls,
      ctx: {
        engine: {
          getManager: (name: string) =>
            name === 'PageManager'
              ? {
                getAllPages: async () => ['A'],
                getRecentChanges: async (opts: Record<string, unknown>) => {
                  calls.push(opts);
                  return [];
                }
              }
              : null
        },
        pageName: 'TestPage',
        linkGraph: {},
        ...(userContext ? { userContext } : {})
      }
    };
  }

  it('passes the viewer principals and never includeAll', async () => {
    // The plugin renders inside a page any viewer can reach, so the stale
    // list must be narrowed to what THAT viewer may see. includeAll: true
    // here listed private page titles to whoever loaded the page.
    const { ctx, calls } = makeSpyContext({ username: 'alice', roles: ['user'] });
    await AppHealthPlugin.execute!(ctx, { checks: 'stale' });
    expect(calls).toHaveLength(1);
    expect(calls[0].principals).toEqual(['user', 'alice']);
    expect('includeAll' in calls[0]).toBe(false);
  });

  it('anonymous viewer: empty principals', async () => {
    const { ctx, calls } = makeSpyContext();
    await AppHealthPlugin.execute!(ctx, { checks: 'stale' });
    expect(calls[0].principals).toEqual([]);
  });
});
