/**
 * @file WikiRoutes-ChromeDenial.test.ts
 * @description #950 — site chrome renders unconditionally, and a restriction
 * that is no longer honoured must say so.
 *
 * LeftMenu and Footer used to run the full ACL evaluator; a denial replaced the
 * fragment with an empty string, so the affected user lost the sidebar or
 * footer on EVERY page of the site with nothing logged above `info`.
 *
 * The gating is gone (a fragment is not a destination — the pages it links to
 * still enforce their own ACLs). The failure mode of removing it is the mirror
 * image, frontmatter that silently stops working, so these tests pin that a
 * restriction is reported rather than dropped in silence.
 */
import logger from '../../utils/logger';

type ChromeWarner = {
  warnOnChromeRestriction(label: 'LeftMenu' | 'Footer', metadata: unknown): void;
};

describe('#950 chrome restriction reporting', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let routes: ChromeWarner;

  beforeEach(async () => {
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    // spyOn reuses an existing spy, so recorded calls survive restoreAllMocks
    // and leak between cases.
    warn.mockClear();
    const mod = await import('../WikiRoutes');
    const WikiRoutes = (mod.default ?? mod) as unknown as { prototype: ChromeWarner };
    routes = Object.create(WikiRoutes.prototype) as ChromeWarner;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('warns when a chrome page declares an audience', () => {
    routes.warnOnChromeRestriction('LeftMenu', { audience: ['admin'] });

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('LeftMenu declares audience');
    expect(message).toContain('NOT enforced');
    // Must tell the operator what to do instead, not just that it was ignored.
    expect(message).toContain('Move the restriction to the linked pages');
  });

  test('warns when a chrome page declares access.view, naming the key', () => {
    routes.warnOnChromeRestriction('Footer', { access: { view: ['admin'] } });
    expect(String(warn.mock.calls[0][0])).toContain('declares access.view');
  });

  test('#1275 says nothing for the access.edit stamp every addon system page carries', () => {
    // AddonsManager stamps `{ edit: ['admin'] }` on addon system pages (#971).
    // geohazardwatch's LeftMenu is one, and this fired on every render there
    // for a restriction the removed gate never evaluated: it gated `view`
    // only, and `access.edit` is still enforced on edits of the page itself.
    routes.warnOnChromeRestriction('LeftMenu', { access: { edit: ['admin'] } });
    routes.warnOnChromeRestriction('Footer', { access: { edit: ['admin'], delete: ['admin'] } });
    expect(warn).not.toHaveBeenCalled();
  });

  test('#1275 says nothing for an empty access.view — the resolver treats it as no rule', () => {
    routes.warnOnChromeRestriction('LeftMenu', { access: { view: [] } });
    routes.warnOnChromeRestriction('LeftMenu', { access: {} });
    expect(warn).not.toHaveBeenCalled();
  });

  test('#1275 access.edit beside a real view rule still warns, about the view rule', () => {
    routes.warnOnChromeRestriction('LeftMenu', { access: { edit: ['admin'], view: ['admin'] } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('declares access.view');
  });

  test('calls out private:true by name', () => {
    // A hard constraint everywhere else in the evaluator, so an operator who
    // set it has the strongest expectation that it is enforced.
    routes.warnOnChromeRestriction('LeftMenu', { private: true });
    expect(String(warn.mock.calls[0][0])).toContain('private:true');
  });

  test('reports every restriction present, not just the first', () => {
    routes.warnOnChromeRestriction('LeftMenu', { audience: ['a'], access: { view: ['a'] }, private: true });
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('audience');
    expect(message).toContain('access.view');
    expect(message).toContain('private:true');
  });

  test('says nothing for an ordinary unrestricted chrome page', () => {
    // The overwhelmingly common case. Warning here would train operators to
    // ignore the message.
    routes.warnOnChromeRestriction('LeftMenu', { title: 'LeftMenu', slug: 'leftmenu' });
    expect(warn).not.toHaveBeenCalled();
  });

  test('says nothing when an empty audience array is present', () => {
    routes.warnOnChromeRestriction('LeftMenu', { audience: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  test('says nothing when no chrome page was resolved', () => {
    routes.warnOnChromeRestriction('Footer', null);
    routes.warnOnChromeRestriction('Footer', undefined);
    expect(warn).not.toHaveBeenCalled();
  });
});
