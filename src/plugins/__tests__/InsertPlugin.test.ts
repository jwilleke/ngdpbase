/**
 * InsertPlugin tests (#665)
 *
 * Covers:
 *  - Target parsing: page, pagesection (heading), pagesection (?section=N)
 *  - ACL: public → renders, private + non-owner → placeholder, private + owner/admin → renders
 *  - Section extraction by index and heading
 *  - No-recursion guard: nested [{Insert}] stripped pre-render
 *  - Attribution link rendered with optional section label
 *  - Graceful degradation: PageManager unavailable / page not found / render failure
 *
 * @jest-environment node
 */

import { describe, expect, test, vi } from 'vitest';
import InsertPlugin from '../InsertPlugin';

function makeContext(opts: {
  pageManager?: Record<string, (...args: unknown[]) => unknown> | null;
  renderingManager?: Record<string, (...args: unknown[]) => unknown> | null;
  userContext?: { username?: string; roles?: string[] } | null;
  hostPage?: string;
} = {}) {
  const managers: Record<string, unknown> = {};
  if (opts.pageManager !== null) {
    managers.PageManager = opts.pageManager ?? {
      getPage: vi.fn().mockResolvedValue({
        content: '# Title\n\nFull body.\n\n# Two\n\nSection two.',
        metadata: {}
      })
    };
  }
  if (opts.renderingManager !== null) {
    managers.RenderingManager = opts.renderingManager ?? {
      renderMarkdown: vi.fn().mockImplementation(async (content: string) => `<rendered>${content}</rendered>`)
    };
  }

  return {
    pageName: opts.hostPage ?? 'HostPage',
    linkGraph: {},
    engine: {
      getManager: (name: string) => managers[name],
      logger: { error: vi.fn() }
    },
    userContext: opts.userContext ?? { username: 'alice', authenticated: true, roles: ['reader'] }
  };
}

describe('InsertPlugin', () => {
  describe('metadata', () => {
    test('plugin name and version', () => {
      expect(InsertPlugin.name).toBe('InsertPlugin');
      expect(InsertPlugin.version).toBe('1.0.0');
      expect(typeof InsertPlugin.execute).toBe('function');
    });
  });

  describe('target parsing / empty cases', () => {
    test('returns empty when neither page nor pagesection provided', async () => {
      const ctx = makeContext();
      const result = await InsertPlugin.execute!(ctx, {});
      expect(result).toBe('');
    });

    test('returns empty when target is whitespace', async () => {
      const ctx = makeContext();
      const result = await InsertPlugin.execute!(ctx, { page: '   ' });
      expect(result).toBe('');
    });
  });

  describe('full-page insert', () => {
    test('renders page content + attribution', async () => {
      const ctx = makeContext();
      const result = await InsertPlugin.execute!(ctx, { page: 'TargetPage' }) as string;
      expect(result).toContain('<rendered>');
      expect(result).toContain('Full body.');
      expect(result).toContain('insert-plugin-attribution');
      expect(result).toContain('href="/view/TargetPage"');
    });

    test('attribution has no section label for full-page', async () => {
      const ctx = makeContext();
      const result = await InsertPlugin.execute!(ctx, { page: 'TargetPage' }) as string;
      expect(result).not.toContain('section:');
    });
  });

  describe('ACL — private pages', () => {
    function privatePage(author: string) {
      return {
        getPage: vi.fn().mockResolvedValue({
          content: 'secret stuff',
          metadata: { private: true, author }
        })
      };
    }

    test('viewer who is not author and not admin → placeholder', async () => {
      const ctx = makeContext({
        pageManager: privatePage('bob'),
        userContext: { username: 'alice', roles: ['reader'] }
      });
      const result = await InsertPlugin.execute!(ctx, { page: 'PrivatePage' }) as string;
      expect(result).toContain('insert-plugin-placeholder');
      expect(result).toContain('not visible');
      expect(result).not.toContain('secret stuff');
    });

    test('viewer is the author → renders', async () => {
      const ctx = makeContext({
        pageManager: privatePage('alice'),
        userContext: { username: 'alice', roles: ['reader'] }
      });
      const result = await InsertPlugin.execute!(ctx, { page: 'PrivatePage' }) as string;
      expect(result).not.toContain('insert-plugin-placeholder');
      expect(result).toContain('secret stuff');
    });

    test('viewer has admin role → renders even if not author', async () => {
      const ctx = makeContext({
        pageManager: privatePage('bob'),
        userContext: { username: 'alice', roles: ['admin'] }
      });
      const result = await InsertPlugin.execute!(ctx, { page: 'PrivatePage' }) as string;
      expect(result).not.toContain('insert-plugin-placeholder');
      expect(result).toContain('secret stuff');
    });

    test('also honours creator field as ownership signal', async () => {
      const pm = {
        getPage: vi.fn().mockResolvedValue({
          content: 'mine',
          metadata: { private: true, creator: 'alice' }
        })
      };
      const ctx = makeContext({ pageManager: pm });
      const result = await InsertPlugin.execute!(ctx, { page: 'P' }) as string;
      expect(result).toContain('mine');
    });
  });

  describe('section by index (?section=N)', () => {
    function multiSectionPage() {
      return {
        getPage: vi.fn().mockResolvedValue({
          content: '# One\n\nFirst.\n\n# Two\n\nSecond.\n\n# Three\n\nThird.',
          metadata: {}
        })
      };
    }

    test('extracts section 1 (zero-based)', async () => {
      const ctx = makeContext({ pageManager: multiSectionPage() });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page?section=1' }) as string;
      expect(result).toContain('Two');
      expect(result).toContain('Second.');
      expect(result).not.toContain('First.');
      expect(result).not.toContain('Third.');
    });

    test('section label appended to attribution', async () => {
      const ctx = makeContext({ pageManager: multiSectionPage() });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page?section=2' }) as string;
      expect(result).toContain('section: #2');
    });

    test('out-of-range section → placeholder', async () => {
      const ctx = makeContext({ pageManager: multiSectionPage() });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page?section=99' }) as string;
      expect(result).toContain('insert-plugin-placeholder');
      expect(result).toContain('section 99 not found');
    });
  });

  describe('section by heading text (#Heading)', () => {
    function pageWithHeadings() {
      return {
        getPage: vi.fn().mockResolvedValue({
          content: '# Introduction\n\nIntro text.\n\n# Symptoms\n\nSymptom text.\n\n# Treatment\n\nTreatment text.',
          metadata: {}
        })
      };
    }

    test('case-insensitive heading match extracts the right section', async () => {
      const ctx = makeContext({ pageManager: pageWithHeadings() });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page#symptoms' }) as string;
      expect(result).toContain('Symptom text');
      expect(result).not.toContain('Intro text');
      expect(result).not.toContain('Treatment text');
    });

    test('attribution shows the matched heading name', async () => {
      const ctx = makeContext({ pageManager: pageWithHeadings() });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page#Treatment' }) as string;
      expect(result).toContain('section: Treatment');
    });

    test('unknown heading → placeholder', async () => {
      const ctx = makeContext({ pageManager: pageWithHeadings() });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page#Nonexistent' }) as string;
      expect(result).toContain('insert-plugin-placeholder');
      expect(result).toContain('section &quot;Nonexistent&quot; not found');
    });
  });

  describe('no-recursion guard', () => {
    test('nested [{Insert}] syntax inside inserted page is stripped before render', async () => {
      const pm = {
        getPage: vi.fn().mockResolvedValue({
          content: 'top content\n[{Insert page=\'OtherPage\'}]\nbottom content',
          metadata: {}
        })
      };
      const renderingManager = {
        renderMarkdown: vi.fn().mockImplementation(async (content: string) => `<rendered>${content}</rendered>`)
      };
      const ctx = makeContext({ pageManager: pm, renderingManager });
      await InsertPlugin.execute!(ctx, { page: 'TargetPage' });

      const renderedSource = (renderingManager.renderMarkdown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(renderedSource).not.toContain("[{Insert page='OtherPage'}]");
      expect(renderedSource).toContain('Insert (skipped: no recursion)');
      expect(renderedSource).toContain('top content');
      expect(renderedSource).toContain('bottom content');
    });

    test('non-Insert plugin syntax passes through to the renderer', async () => {
      const pm = {
        getPage: vi.fn().mockResolvedValue({
          content: "Look at this image: [{Image src='cat.jpg'}] and this counter: [{Counter}]",
          metadata: {}
        })
      };
      const renderingManager = {
        renderMarkdown: vi.fn().mockImplementation(async (content: string) => `<rendered>${content}</rendered>`)
      };
      const ctx = makeContext({ pageManager: pm, renderingManager });
      await InsertPlugin.execute!(ctx, { page: 'T' });

      const renderedSource = (renderingManager.renderMarkdown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(renderedSource).toContain("[{Image src='cat.jpg'}]");
      expect(renderedSource).toContain('[{Counter}]');
    });
  });

  describe('#748 — no-caption full-page must not duplicate a leading title', () => {
    function pmWith(content: string, title?: string) {
      return {
        getPage: vi.fn().mockResolvedValue({
          content,
          metadata: title ? { title } : {}
        })
      };
    }

    test('source body already leads with a heading → NO "## <title>" prepended', async () => {
      // The standard page template starts with `# [{$pagename}]`.
      const rm = { renderMarkdown: vi.fn().mockImplementation(async (c: string) => `<rendered>${c}</rendered>`) };
      const ctx = makeContext({ pageManager: pmWith('# [{$pagename}]\n\nReported symptoms.', 'MEW-Current Symptoms'), renderingManager: rm });

      await InsertPlugin.execute!(ctx, { page: 'MEW-Current Symptoms' });

      const rendered = (rm.renderMarkdown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      // The body's own heading is kept verbatim as line 0; no second title.
      expect(rendered.split('\n')[0]).toBe('# [{$pagename}]');
      expect(rendered).not.toContain('## MEW-Current Symptoms');
      expect(rendered).not.toMatch(/^## /); // nothing prepended at all
    });

    test('source body has NO leading heading → still prepends "## <title>" (#741 preserved)', async () => {
      const rm = { renderMarkdown: vi.fn().mockImplementation(async (c: string) => `<rendered>${c}</rendered>`) };
      const ctx = makeContext({ pageManager: pmWith('Just body text, no heading.', 'Src Title'), renderingManager: rm });

      await InsertPlugin.execute!(ctx, { page: 'SrcPage' });

      const rendered = (rm.renderMarkdown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(rendered.startsWith('## Src Title\n\n')).toBe(true);
    });

    test('explicit caption still replaces the source heading (regression)', async () => {
      const rm = { renderMarkdown: vi.fn().mockImplementation(async (c: string) => `<rendered>${c}</rendered>`) };
      const ctx = makeContext({ pageManager: pmWith('# Original Heading\n\nbody', 'Src'), renderingManager: rm });

      await InsertPlugin.execute!(ctx, { page: 'SrcPage', caption: 'My Caption' });

      const rendered = (rm.renderMarkdown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(rendered.split('\n')[0]).toBe('# My Caption');
      expect(rendered).not.toContain('Original Heading');
    });
  });

  describe('attribution', () => {
    test('full-page attribution links to /view/<encodedPageName>', async () => {
      const ctx = makeContext();
      const result = await InsertPlugin.execute!(ctx, { page: 'My Page With Spaces' }) as string;
      expect(result).toContain('href="/view/My%20Page%20With%20Spaces"');
    });

    test('escapes HTML in page name (attribution link)', async () => {
      // InsertPlugin emits the page name directly only in the attribution
      // (and placeholders) — those must escape HTML. The inserted body goes
      // through RenderingManager, which is responsible for escaping rendered
      // markdown; the echo mock here intentionally does not render, so we
      // assert on the attribution segment (InsertPlugin's own output).
      const pm = {
        getPage: vi.fn().mockResolvedValue({ content: 'hi', metadata: {} })
      };
      const ctx = makeContext({ pageManager: pm });
      const result = await InsertPlugin.execute!(ctx, { page: '<script>x</script>' }) as string;
      const attribution = result.slice(result.indexOf('insert-plugin-attribution'));
      expect(attribution).not.toContain('<script>x</script>');
      expect(attribution).toContain('&lt;script&gt;');
    });
  });

  describe('graceful degradation', () => {
    test('PageManager unavailable → placeholder', async () => {
      const ctx = makeContext({ pageManager: null });
      const result = await InsertPlugin.execute!(ctx, { page: 'X' }) as string;
      expect(result).toContain('insert-plugin-placeholder');
      expect(result).toContain('PageManager unavailable');
    });

    test('page not found → placeholder', async () => {
      const ctx = makeContext({
        pageManager: { getPage: vi.fn().mockResolvedValue(null) }
      });
      const result = await InsertPlugin.execute!(ctx, { page: 'GhostPage' }) as string;
      expect(result).toContain('insert-plugin-placeholder');
      expect(result).toContain('not found');
      expect(result).toContain('GhostPage');
    });

    test('getPage throws → placeholder, does not crash the host page', async () => {
      const ctx = makeContext({
        pageManager: { getPage: vi.fn().mockRejectedValue(new Error('disk error')) }
      });
      const result = await InsertPlugin.execute!(ctx, { page: 'X' }) as string;
      expect(result).toContain('insert-plugin-placeholder');
      expect(result).toContain('lookup failed');
    });

    test('RenderingManager unavailable → falls back to escaped raw content', async () => {
      const ctx = makeContext({ renderingManager: null });
      const result = await InsertPlugin.execute!(ctx, { page: 'X' }) as string;
      expect(result).toContain('<pre>');
      expect(result).toContain('Full body.');
      expect(result).toContain('insert-plugin-attribution');
    });

    test('renderMarkdown throws → placeholder', async () => {
      const ctx = makeContext({
        renderingManager: {
          renderMarkdown: vi.fn().mockRejectedValue(new Error('parser bomb'))
        }
      });
      const result = await InsertPlugin.execute!(ctx, { page: 'X' }) as string;
      expect(result).toContain('insert-plugin-placeholder');
      expect(result).toContain('render failed');
    });
  });

  describe('?section= takes precedence over # when both appear', () => {
    test('mixed target uses ?section= and ignores #', async () => {
      const pm = {
        getPage: vi.fn().mockResolvedValue({
          content: '# A\n\nfirst.\n\n# B\n\nsecond.',
          metadata: {}
        })
      };
      const ctx = makeContext({ pageManager: pm });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page?section=1#NoseHeading' }) as string;
      // section=1 is "B" → second
      expect(result).toContain('second.');
      expect(result).not.toContain('first.');
    });
  });

  describe('caption override / suppression (#741)', () => {
    function multiSectionPage() {
      return {
        getPage: vi.fn().mockResolvedValue({
          content: '# One\n\nFirst.\n\n# Two\n\nSecond.\n\n# Three\n\nThird.',
          metadata: {}
        })
      };
    }

    test('caption="Text" replaces the imported section heading text (keeps level)', async () => {
      const ctx = makeContext({ pageManager: multiSectionPage() });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page?section=1', caption: 'My Cool Heading' }) as string;
      expect(result).toContain('# My Cool Heading');
      expect(result).toContain('Second.');
      expect(result).not.toContain('Two'); // source heading text gone
    });

    test('caption="none" drops the imported heading entirely', async () => {
      const ctx = makeContext({ pageManager: multiSectionPage() });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page?section=1', caption: 'none' }) as string;
      expect(result).toContain('Second.');
      expect(result).not.toContain('Two');
      expect(result).not.toContain('none'); // not rendered as a heading
      expect(result).not.toMatch(/<rendered>\s*#/); // body starts with no heading
    });

    test('no caption param keeps the source heading (back-compat)', async () => {
      const ctx = makeContext({ pageManager: multiSectionPage() });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page?section=1' }) as string;
      expect(result).toContain('# Two');
    });

    test('caption applies to a full-page insert too', async () => {
      const ctx = makeContext(); // default page: "# Title\n\nFull body.\n\n# Two\n\nSection two."
      const result = await InsertPlugin.execute!(ctx, { page: 'Page', caption: 'Doc Heading' }) as string;
      expect(result).toContain('# Doc Heading');
      expect(result).not.toContain('# Title');
    });
  });

  // #741 follow-up — transcluded headings resolved to the HOST page, and
  // whole-page inserts had no source-identity heading.
  describe('source-page identity (#741 follow-up)', () => {
    test('renders inserted content under the SOURCE page name, not the host', async () => {
      const calls: Array<[string, string]> = [];
      const renderingManager = {
        renderMarkdown: vi.fn().mockImplementation(async (content: string, pageName: string) => {
          calls.push([content, pageName]);
          return `<rendered>${content}</rendered>`;
        })
      };
      const pm = {
        getPage: vi.fn().mockResolvedValue({
          content: '# One\n\nfirst.\n\n# Two\n\nsecond.',
          metadata: {}
        })
      };
      const ctx = makeContext({ pageManager: pm, renderingManager, hostPage: 'MEW-Medical Summary' });
      await InsertPlugin.execute!(ctx, { pagesection: 'MEW-Current Health Concerns?section=1' });

      // 2nd arg to renderMarkdown is the render pageName — must be the
      // SOURCE page (so $pagename/$title resolve to it), never the host.
      expect(calls[0][1]).toBe('MEW-Current Health Concerns');
      expect(calls[0][1]).not.toBe('MEW-Medical Summary');
    });

    test('whole-page insert prepends "## <pageName>" when no caption and body has no leading heading', async () => {
      // #748: prepend only when the source body does NOT already lead with
      // its own heading (otherwise the title rendered twice). pageName is the
      // fallback when there is no metadata.title.
      const pm = {
        getPage: vi.fn().mockResolvedValue({ content: 'Body, no heading.', metadata: {} })
      };
      const ctx = makeContext({ pageManager: pm });
      const result = await InsertPlugin.execute!(ctx, { page: 'TargetPage' }) as string;
      expect(result).toContain('## TargetPage');
    });

    test('whole-page insert uses the source page TITLE when present', async () => {
      const pm = {
        getPage: vi.fn().mockResolvedValue({
          content: 'Body only.',
          metadata: { title: 'My Friendly Title' }
        })
      };
      const ctx = makeContext({ pageManager: pm });
      const result = await InsertPlugin.execute!(ctx, { page: 'some-slug' }) as string;
      expect(result).toContain('## My Friendly Title');
    });

    test('section insert does NOT get the source-title heading (keeps its own)', async () => {
      const pm = {
        getPage: vi.fn().mockResolvedValue({
          content: '# One\n\nfirst.\n\n# Two\n\nsecond.',
          metadata: { title: 'Src' }
        })
      };
      const ctx = makeContext({ pageManager: pm });
      const result = await InsertPlugin.execute!(ctx, { pagesection: 'Page?section=1' }) as string;
      expect(result).toContain('# Two');     // section's own heading kept
      expect(result).not.toContain('## Src'); // no source-title prepend
    });

    test('whole-page insert with caption gets NO source-title prepend (caption wins)', async () => {
      const pm = {
        getPage: vi.fn().mockResolvedValue({
          content: '# Orig\n\nbody.',
          metadata: { title: 'Src' }
        })
      };
      const ctx = makeContext({ pageManager: pm });
      const result = await InsertPlugin.execute!(ctx, { page: 'Page', caption: 'Chosen' }) as string;
      expect(result).toContain('# Chosen');
      expect(result).not.toContain('## Src');
    });
  });
});
