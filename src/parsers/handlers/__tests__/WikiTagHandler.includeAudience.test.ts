/**
 * `<wiki:Include>` honours the included page's audience (#1431 step 7).
 *
 * The include's permission check passed `pageMetadata: null`, and its comment
 * said why: the INCLUDED page's own rules were skipped and global policy
 * answered alone. Tier 1 is that page's audience, so a page restricted to
 * `audience: [admin]` rendered into any page for any reader the global policy
 * lets view — and anyone who can edit one page can write the include.
 *
 * These run the REAL `PolicyInformationPoint` behind the handler, because the defect was in
 * what the decider was handed, and a mocked decider cannot see that.
 */
import PolicyInformationPoint from '../../../security/PolicyInformationPoint';
import WikiTagHandler from '../WikiTagHandler';

const PAGES: Record<string, Record<string, unknown>> = {
  AdminsOnly: { title: 'AdminsOnly', uuid: 'a1', lastModified: '', audience: ['admin'] },
  Public: { title: 'Public', uuid: 'p1', lastModified: '' }
};
const CONTENT: Record<string, string> = {
  AdminsOnly: 'SECRET-ADMIN-TEXT',
  Public: 'public text'
};

/** Global policy lets every reader view every page — the case the bug needed. */
const evaluator = {
  evaluateAccess: async () => ({ hasDecision: true, allowed: true, policyName: 'everyone-reads' })
};

function makeEngine(withAcl = true) {
  const pageManager = {
    getPageMetadata: async (name: string) => PAGES[name] ?? null,
    getPage: async (name: string) =>
      PAGES[name] ? { content: CONTENT[name], metadata: PAGES[name] } : null,
    checkPrivatePageAccess: async () => null
  };
  let acl: unknown = null;
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'PageManager') return pageManager;
      if (name === 'PolicyEvaluator') return evaluator;
      if (name === 'PolicyInformationPoint') return withAcl ? acl : null;
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      return null;
    }
  };
  acl = new PolicyInformationPoint(engine);
  return engine;
}

/** A ParseContext-shaped object: just what the include path reads. */
function contextFor(engine: ReturnType<typeof makeEngine>, userContext: unknown) {
  const metadata = new Map<string, unknown>();
  return {
    pageName: 'Host',
    engine,
    getManager: (n: string) => engine.getManager(n),
    wikiContext: { pageName: 'Host', userContext },
    getMetadata: (k: string) => metadata.get(k),
    setMetadata: (k: string, v: unknown) => metadata.set(k, v)
  } as never;
}

const reader = { username: 'bob', roles: ['reader'], isAuthenticated: true };
const admin = { username: 'root', roles: ['admin'], isAuthenticated: true };

describe('#1431 <wiki:Include> honours the included page\'s audience', () => {
  const include = (h: WikiTagHandler, page: string, ctx: never) =>
    (h as unknown as { checkIncludePermission(p: string, c: never): Promise<boolean> })
      .checkIncludePermission(page, ctx);

  test('a reader outside the audience cannot include the page', async () => {
    const engine = makeEngine();
    const handler = new WikiTagHandler(engine);
    expect(await include(handler, 'AdminsOnly', contextFor(engine, reader))).toBe(false);
  });

  test('a reader inside the audience can', async () => {
    const engine = makeEngine();
    const handler = new WikiTagHandler(engine);
    expect(await include(handler, 'AdminsOnly', contextFor(engine, admin))).toBe(true);
  });

  test('an unrestricted page is still includable — the fix does not break includes', async () => {
    const engine = makeEngine();
    const handler = new WikiTagHandler(engine);
    expect(await include(handler, 'Public', contextFor(engine, reader))).toBe(true);
  });

  test('a page that does not exist is not includable', async () => {
    const engine = makeEngine();
    const handler = new WikiTagHandler(engine);
    expect(await include(handler, 'NoSuchPage', contextFor(engine, reader))).toBe(false);
  });

  test('with no PolicyInformationPoint, nothing is included — it used to allow', async () => {
    const engine = makeEngine(false);
    const handler = new WikiTagHandler(engine);
    expect(await include(handler, 'Public', contextFor(engine, reader))).toBe(false);
  });
});
