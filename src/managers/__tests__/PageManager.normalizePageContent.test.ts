/**
 * #1332 — PageManager owns the Markdown fix steps: `save` runs only the steps
 * safe on an ordinary save, `convert` runs them all. Pure — nothing is saved.
 */
import PageManager from '../PageManager';
import type { WikiEngine } from '../../types/WikiEngine';

function makeEngine(): WikiEngine {
  const cm = {
    getProperty: vi.fn((_key: string, dv: unknown) => dv),
    getResolvedDataPath: vi.fn((_key: string, dv: string) => dv)
  };
  return { getManager: vi.fn((name: string) => (name === 'ConfigurationManager' ? cm : null)) };
}

describe('PageManager.normalizePageContent', () => {
  const page = '* Tests:\n** Skin\n\n* Other';

  it('save mode fixes JSPWiki ** bullets and leaves valid Markdown alone', () => {
    const pm = new PageManager(makeEngine());
    const r = pm.normalizePageContent(page, { mode: 'save' });
    expect(r.content).toBe('* Tests:\n  - Skin\n\n* Other');
    expect(r.changes).toEqual([{ step: 'jspwiki-bullets', summary: expect.any(String), lines: [2] }]);
  });

  it('convert mode, the default, runs every step', () => {
    const pm = new PageManager(makeEngine());
    const r = pm.normalizePageContent(page);
    expect(r.content).toBe('- Tests:\n  - Skin\n- Other');
    expect(r.changes.map((c) => c.step)).toEqual(['jspwiki-bullets', 'bullet-markers', 'tighten-lists']);
  });

  it('runs the named steps only', () => {
    const pm = new PageManager(makeEngine());
    expect(pm.normalizePageContent(page, { steps: ['bullet-markers'] }).content).toBe('- Tests:\n** Skin\n\n- Other');
  });

  it('reports no changes for a page already in the house style', () => {
    const pm = new PageManager(makeEngine());
    const md = '- a\n  - b\n';
    expect(pm.normalizePageContent(md)).toEqual({ content: md, changes: [] });
  });
});

describe('PageManager.savePageWithContext runs the save-safe steps at the door (#1332)', () => {
  function makeSaver() {
    const provider = {
      getPage: vi.fn(async () => null),
      savePage: vi.fn(async () => {}),
      movePrivatePage: vi.fn(async () => {})
    };
    const pm = new PageManager(makeEngine());
    (pm as unknown as { provider: unknown }).provider = provider;
    const ctx = (content: string | null) => ({ pageName: 'P', content, userContext: { username: 'jim' } }) as unknown;
    return { pm, provider, ctx };
  }

  it('writes the fixed body and returns what changed', async () => {
    const { pm, provider, ctx } = makeSaver();
    const r = await pm.savePageWithContext(ctx('* Tests:\n** Skin\n\n* Other'), { title: 'P' });
    expect(provider.savePage).toHaveBeenCalledWith('P', '* Tests:\n  - Skin\n\n* Other', expect.anything());
    expect(r.content).toBe('* Tests:\n  - Skin\n\n* Other');
    expect(r.fixes.map((f) => f.step)).toEqual(['jspwiki-bullets']);
  });

  it('never applies the convert-only steps on an ordinary save', async () => {
    const { pm, provider, ctx } = makeSaver();
    const md = '* a\n\n* b';
    const r = await pm.savePageWithContext(ctx(md), { title: 'P' });
    expect(provider.savePage).toHaveBeenCalledWith('P', md, expect.anything());
    expect(r.fixes).toEqual([]);
  });

  it('leaves a metadata-only save alone', async () => {
    const { pm, provider, ctx } = makeSaver();
    const r = await pm.savePageWithContext(ctx(null), { title: 'P' });
    expect(provider.savePage).toHaveBeenCalledWith('P', null, expect.anything());
    expect(r.fixes).toEqual([]);
  });
});

describe('PageManager.convertPageToNcm (#1332)', () => {
  it('runs every fix step, then the NCM normalizer, and reports the steps as notes', () => {
    const pm = new PageManager(makeEngine());
    const r = pm.convertPageToNcm('---\ntitle: P\n---\n* Tests:\n** Skin\n\n* Other\n');
    expect(r.content).toContain('- Tests:\n  - Skin\n- Other');
    expect(r.content).toContain('ncmVersion:');
    expect(r.fixes.map((f) => f.step)).toEqual(['jspwiki-bullets', 'bullet-markers', 'tighten-lists']);
    expect(r.warnings.filter((w) => w.kind === 'converter-note').map((w) => w.detail)).toEqual(
      r.fixes.map((f) => `${f.summary} (${f.step})`)
    );
  });

  it('is idempotent', () => {
    const pm = new PageManager(makeEngine());
    const once = pm.convertPageToNcm('---\ntitle: P\n---\n* a\n\n* b\n').content;
    const twice = pm.convertPageToNcm(once);
    expect(twice.content).toBe(once);
    expect(twice.fixes).toEqual([]);
  });

  it('names fix steps for the after-save notice, skipping unknown ids', () => {
    const pm = new PageManager(makeEngine());
    expect(pm.fixStepSummaries(['jspwiki-bullets', '<script>'])).toEqual(['JSPWiki ** bullets became nested - bullets']);
  });
});
