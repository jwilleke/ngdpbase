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
