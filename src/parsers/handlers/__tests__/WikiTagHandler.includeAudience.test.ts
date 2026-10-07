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
import { readPageThroughDoor } from '../../../__tests__/__fixtures__/pageReadDoor';
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
  let acl: unknown = null;
  // #1622: the include reads through PageManager's real page-read door.
  const pageManager = {
    getPageMetadata: async (name: string) => PAGES[name] ?? null,
    checkPrivatePageAccess: async () => null,
    readPage: null as unknown
  };
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
  pageManager.readPage = readPageThroughDoor(engine, (name) =>
    PAGES[name] ? { content: CONTENT[name], metadata: PAGES[name] } : null);
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
    setMetadata: (k: string, v: unknown) => metadata.set(k, v),
    clone: (pageContext: unknown) => ({ pageContext, setMetadata: () => undefined })
  } as never;
}

const reader = { username: 'bob', roles: ['reader'], isAuthenticated: true };
const admin = { username: 'root', roles: ['admin'], isAuthenticated: true };

describe('#1431 <wiki:Include> honours the included page\'s audience', () => {
  // #1622: the include itself, through the page-read door — true when the
  // page's text reached the output, false when it was refused or missing.
  const include = (h: WikiTagHandler, page: string, ctx: never) =>
    (h as unknown as { handleIncludeTag(a: { page: string }, c: never): Promise<string> })
      .handleIncludeTag({ page }, ctx)
      .then((out) => page in CONTENT && out.includes(CONTENT[page]), () => false);

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

describe('#1622 exists: answers through the page-read door', () => {
  const exists = (h: WikiTagHandler, page: string, ctx: never) =>
    (h as unknown as { evaluateCondition(c: string, x: never): Promise<boolean> }).evaluateCondition(`exists:${page}`, ctx);

  test('a page the reader may not read does not exist for them', async () => {
    const engine = makeEngine();
    const handler = new WikiTagHandler(engine);
    expect(await exists(handler, 'AdminsOnly', contextFor(engine, reader))).toBe(false);
    expect(await exists(handler, 'AdminsOnly', contextFor(engine, admin))).toBe(true);
    expect(await exists(handler, 'Public', contextFor(engine, reader))).toBe(true);
    expect(await exists(handler, 'NoSuchPage', contextFor(engine, admin))).toBe(false);
  });
});
