/**
 * #1677 — a page that belongs to a feature is not there while the feature is off.
 *
 * Runs PageManager's real deciding read and listing, with the real
 * PolicyInformationPoint behind them; only storage, global policy (every
 * reader views every page) and the one setting are stubbed.
 */
vi.unmock('../PageManager');
import PageManager from '../PageManager';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import { hiddenByFeature } from '../../utils/pageFeature';

const PAGES: Record<string, Record<string, unknown>> = {
  'Using Captures': { title: 'Using Captures', uuid: 'u-cap', 'requires-setting': 'ngdpbase.capture.enabled' },
  Public: { title: 'Public', uuid: 'u-pub' }
};
const resolve = (id: string) => Object.keys(PAGES).find((t) => t === id || PAGES[t].uuid === id) ?? null;
const reader = { username: 'bob', roles: ['reader', 'Authenticated', 'All'], isAuthenticated: true };

function makeManager(captureEnabled: unknown) {
  const provider = {
    getPageMetadata: vi.fn(async (id: string) => { const t = resolve(id); return t ? { ...PAGES[t] } : null; }),
    pageExists: vi.fn((id: string) => resolve(id) !== null),
    getPage: vi.fn(async (id: string) => { const t = resolve(id); return t ? { title: t, content: `${t} words`, metadata: PAGES[t] } : null; }),
    getAllPageInfo: vi.fn(async () => Object.entries(PAGES).map(([title, metadata]) => ({ title, uuid: metadata.uuid, filePath: '', metadata })))
  };
  let pip: unknown = null;
  const allow = { hasDecision: true, allowed: true, policyName: 'everyone-reads', reason: 'test' };
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'PolicyInformationPoint') return pip;
      if (name === 'PageManager') return pm;
      if (name === 'PolicyEvaluator') return { evaluateAccess: async () => allow, compile: () => () => allow };
      if (name === 'ConfigurationManager') {
        return { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.capture.enabled' ? captureEnabled : d) };
      }
      return null;
    }
  };
  const pm = new PageManager(engine);
  (pm as unknown as { provider: unknown }).provider = provider;
  pip = new PolicyInformationPoint(engine);
  return { pm, provider };
}

describe('#1677 hiddenByFeature', () => {
  const config = (v: unknown) => ({ getProperty: () => v });
  test('a page naming no setting is never hidden', () => {
    expect(hiddenByFeature({ title: 'x' }, config(false))).toBe(false);
    expect(hiddenByFeature(null, config(false))).toBe(false);
  });
  test('hidden unless the named setting is exactly true', () => {
    const md = { 'requires-setting': 'ngdpbase.capture.enabled' };
    expect(hiddenByFeature(md, config(true))).toBe(false);
    for (const v of [false, undefined, 'true', 1]) expect(hiddenByFeature(md, config(v))).toBe(true);
  });
  test('no configuration reader hides nothing', () => {
    expect(hiddenByFeature({ 'requires-setting': 'k' }, null)).toBe(false);
  });
});

describe('#1677 PageManager: a feature-off page reads as not found', () => {
  test('feature off: readPage answers not-found and reads no content', async () => {
    const { pm, provider } = makeManager(false);
    expect(await pm.readPage('Using Captures', reader as never)).toEqual({ ok: false, refusal: 'not-found' });
    expect(provider.getPage).not.toHaveBeenCalled();
  });

  test('feature on: the page reads normally', async () => {
    const { pm } = makeManager(true);
    const read = await pm.readPage('Using Captures', reader);
    expect(read.ok && read.value.content).toBe('Using Captures words');
  });

  test('listings leave it out while the feature is off, and include it when on', async () => {
    expect(await makeManager(false).pm.listPagesFor(reader as never, 'view')).toEqual(['Public']);
    expect(await makeManager(true).pm.listPagesFor(reader as never, 'view')).toEqual(['Public', 'Using Captures']);
  });

  test('a page with no setting is unaffected either way', async () => {
    const read = await makeManager(false).pm.readPage('Public', reader);
    expect(read.ok).toBe(true);
  });
});
