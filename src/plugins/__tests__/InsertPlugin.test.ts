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

  describe('attribution', () => {
    test('full-page attribution links to /view/<encodedPageName>', async () => {
      const ctx = makeContext();
      const result = await InsertPlugin.execute!(ctx, { page: 'My Page With Spaces' }) as string;
      expect(result).toContain('href="/view/My%20Page%20With%20Spaces"');
    });

    test('escapes HTML in page name', async () => {
      const pm = {
        getPage: vi.fn().mockResolvedValue({ content: 'hi', metadata: {} })
      };
      const ctx = makeContext({ pageManager: pm });
      const result = await InsertPlugin.execute!(ctx, { page: '<script>x</script>' }) as string;
      expect(result).not.toContain('<script>x</script>');
      expect(result).toContain('&lt;script&gt;');
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
});
