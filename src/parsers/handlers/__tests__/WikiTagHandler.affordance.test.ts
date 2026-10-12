/**
 * `<wiki:If>` display gates are affordances, not doors (#1668).
 *
 * `<wiki:If test="hasPermission:edit">` and `<wiki:If test="exists:Page">`
 * only decide whether to SHOW a block. Asking the recording door there wrote
 * an `authorization-deny` audit record for every anonymous view of a page
 * using the tag. They now ask the same evaluator without recording; a real
 * door — `canAccess`, which `resaveForKeywordChange` asks before writing a
 * private page — still records its refusal.
 *
 * The real PolicyInformationPoint and PolicyDecisionPoint run behind a real
 * WikiContext and ParseContext, with an AuditManager sink that collects what
 * was written.
 */
import PolicyInformationPoint from '../../../security/PolicyInformationPoint';
import PolicyDecisionPoint from '../../../security/PolicyDecisionPoint';
import WikiContext from '../../../context/WikiContext';
import ParseContext from '../../context/ParseContext';
import WikiRoutes from '../../../routes/WikiRoutes';
import { readPageThroughDoor, mayShowPageThroughDoor } from '../../../__tests__/__fixtures__/pageReadDoor';
import WikiTagHandler from '../WikiTagHandler';
import type { WikiEngine } from '../../../types/WikiEngine';

let records: Array<Record<string, unknown>> = [];

const PAGES: Record<string, { content: string; metadata: Record<string, unknown> }> = {
  EditorsOnly: { content: 'secret', metadata: { title: 'EditorsOnly', uuid: 'e1', audience: ['editor'] } }
};

function makeEngine(): WikiEngine {
  const savePage = vi.fn().mockResolvedValue(undefined);
  const pageManager: Record<string, unknown> = { savePage };
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'ConfigurationManager') {
        return { getProperty: (_k: string, d: unknown) => d, isInitialized: () => true };
      }
      if (name === 'PolicyEvaluator') {
        // Everyone may read; only an `editor` may edit.
        return {
          evaluateAccess: async ({ userContext, action }: { userContext: { roles?: string[] }; action: string }) => {
            if (action === 'page-read') return { hasDecision: true, allowed: true, policyName: 'read-all' };
            if ((userContext.roles ?? []).includes('editor')) return { hasDecision: true, allowed: true, policyName: 'editors' };
            return { hasDecision: false, allowed: false, reason: 'no_match' };
          }
        };
      }
      if (name === 'PolicyDecisionPoint') return pdp;
      if (name === 'PolicyInformationPoint') return pip;
      if (name === 'PageManager') return pageManager;
      if (name === 'AuditManager') {
        return { logAuditEvent: async (e: Record<string, unknown>) => { records.push(e); return 'evt'; } };
      }
      return null;
    }
  };
  const pdp = new PolicyDecisionPoint(engine);
  const pip = new PolicyInformationPoint(engine);
  const pages = (name: string) => PAGES[name] ?? null;
  pageManager.readPage = readPageThroughDoor(engine, pages);
  pageManager.mayShowPage = mayShowPageThroughDoor(engine, pages);
  pageManager.getPageMetadata = async (name: string) => PAGES[name]?.metadata ?? null;
  pageManager.checkPrivatePageAccess = async () => null;
  return engine;
}

const anonymous = { username: 'Anonymous', roles: ['anonymous', 'All'], isAuthenticated: false };
const editor = { username: 'ed', roles: ['editor', 'Authenticated', 'All'], isAuthenticated: true };

/** auditDenial is fire-and-forget; let it land. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function render(engine: WikiEngine, userContext: Record<string, unknown>, markup: string): Promise<string> {
  const wikiContext = new WikiContext(engine, {
    pageName: 'Volcanoes',
    content: markup,
    userContext: userContext as never,
    pageMetadata: { title: 'Volcanoes' } as never
  });
  const parseContext = new ParseContext(markup, { ...wikiContext.toParseOptions(), wikiContext } as never, engine);
  const handler = new WikiTagHandler(engine);
  return handler.process(markup, parseContext);
}

describe('<wiki:If> display gates record nothing (#1668)', () => {
  let engine: WikiEngine;

  beforeEach(async () => {
    records = [];
    engine = makeEngine();
    await engine.getManager<PolicyInformationPoint>('PolicyInformationPoint')!.initialize();
  });

  test('anonymous: hasPermission:edit hides the block and writes no audit record', async () => {
    const out = await render(engine, anonymous, 'before<wiki:If test="hasPermission:edit">EDIT-BLOCK</wiki:If>after');
    expect(out).not.toContain('EDIT-BLOCK');
    expect(out).toContain('before');
    await settle();
    expect(records).toHaveLength(0);
  });

  test('a permitted user sees the block', async () => {
    const out = await render(engine, editor, '<wiki:If test="hasPermission:edit">EDIT-BLOCK</wiki:If>');
    expect(out).toContain('EDIT-BLOCK');
    await settle();
    expect(records).toHaveLength(0);
  });

  test('anonymous: exists: on a page they may not read hides the block and writes no audit record', async () => {
    const out = await render(engine, anonymous, '<wiki:If test="exists:EditorsOnly">SEEN</wiki:If>');
    expect(out).not.toContain('SEEN');
    await settle();
    expect(records).toHaveLength(0);
    const shown = await render(engine, editor, '<wiki:If test="exists:EditorsOnly">SEEN</wiki:If>');
    expect(shown).toContain('SEEN');
  });

  test('the door still records: resaveForKeywordChange refusing a private page writes authorization-deny', async () => {
    const wikiContext = new WikiContext(engine, {
      pageName: 'AlicesDiary',
      userContext: anonymous as never,
      pageMetadata: { title: 'AlicesDiary' } as never
    });
    const routes = new WikiRoutes(engine) as unknown as {
      resaveForKeywordChange(c: unknown, n: string, p: unknown, m: unknown): Promise<boolean>;
    };
    const saved = await routes.resaveForKeywordChange(
      wikiContext,
      'AlicesDiary',
      { content: 'x', metadata: { private: true, author: 'alice' } },
      { private: true, author: 'alice' }
    );
    expect(saved).toBe(false);
    await settle();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ eventType: 'authorization-deny', resource: 'AlicesDiary', action: 'edit' });
  });
});
