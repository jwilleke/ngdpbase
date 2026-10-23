/**
 * #2000 — a refused save named its page "undefined" and notified admins.
 *
 * The editor's live preview (POST /api/preview) renders the text being typed,
 * so a page with an unclosed link reached ValidationFilter.process() through
 * the render path. The filter read `context.pageName`, which ParseContext no
 * longer has (#629 Pass 2 moved it to `context.wikiContext.pageName`), and
 * sent a "Content Validation Errors" notification on every such render.
 *
 * Covers:
 * - render / preview path: the page name from the WikiContext reaches the
 *   log line and the stored report
 * - save path: ValidationManager.collectContentErrors hands the filters a
 *   ParseContext carrying the page and user (editor save, NCM save and
 *   PageManager.savePage all go through it)
 * - no notification is created
 * - the refusal itself (collectErrors) is unchanged
 */

import ValidationFilter from '../ValidationFilter';
import ParseContext from '../../context/ParseContext';
import WikiContext from '../../../context/WikiContext';
import ValidationManager from '../../../managers/ValidationManager';
import logger from '../../../utils/logger';

const UNCLOSED_LINK = 'A link that never closes: [text](https://example.com\n';

function makeEngine(managers: Record<string, unknown> = {}) {
  return { getManager: vi.fn((name: string) => managers[name] ?? null) };
}

function makeFilter(): ValidationFilter {
  const f = new ValidationFilter();
  f.loadModularValidationConfiguration({ engine: makeEngine() });
  (f as unknown as { initializeValidationRules: () => void }).initializeValidationRules();
  return f;
}

describe('ValidationFilter names the page and does not notify (#2000)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  test('render / preview path: the WikiContext page name is in the log line and the report', async () => {
    const addNotification = vi.fn();
    const engine = makeEngine({ NotificationManager: { addNotification } });
    const wikiContext = new WikiContext(engine, {
      context: WikiContext.CONTEXT.PREVIEW,
      pageName: 'EditorInvalidPage',
      userContext: { username: 'alice', roles: ['editor'], isAuthenticated: true }
    });
    const parseContext = new ParseContext(UNCLOSED_LINK, wikiContext.toParseOptions() as never, engine);

    const f = makeFilter();
    await f.process(UNCLOSED_LINK, parseContext);

    const lines = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(lines).toContain('❌ Validation errors in EditorInvalidPage:');
    expect(lines.some((l) => l.includes('undefined'))).toBe(false);

    const [report] = f.getValidationReports();
    expect(report.pageName).toBe('EditorInvalidPage');
    expect(report.userName).toBe('alice');

    expect(addNotification).not.toHaveBeenCalled();
  });

  test('save path: collectContentErrors hands the filters a ParseContext with the page and user', async () => {
    const collectErrors = vi.fn(async () => []);
    const engine = makeEngine({ FilterManager: { getFilterChain: () => ({ collectErrors }) } });
    const vm = new ValidationManager(engine);

    await vm.collectContentErrors(UNCLOSED_LINK, { pageName: 'SavedPage', userName: 'bob' });

    const ctx = (collectErrors.mock.calls[0] as unknown[])[1] as ParseContext;
    expect(ctx).toBeInstanceOf(ParseContext);
    expect(ctx.wikiContext.pageName).toBe('SavedPage');
    expect(ctx.userName).toBe('bob');
    expect(ctx.engine).toBe(engine);
  });

  test('save path through the real filter: the refusal is unchanged and nothing is notified', async () => {
    const addNotification = vi.fn();
    const f = makeFilter();
    const chain = { collectErrors: (c: string, ctx: ParseContext) => f.collectErrors(c, ctx) };
    const engine = makeEngine({
      NotificationManager: { addNotification },
      FilterManager: { getFilterChain: () => chain }
    });
    const vm = new ValidationManager(engine);

    const errors = await vm.collectContentErrors(UNCLOSED_LINK, { pageName: 'SavedPage', userName: 'bob' });

    expect(errors).toEqual([
      expect.objectContaining({ filterId: 'ValidationFilter', rule: 'unclosedMarkdownLink', severity: 'error', line: 1 })
    ]);
    expect(addNotification).not.toHaveBeenCalled();
  });
});
