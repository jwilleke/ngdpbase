/** POST /admin/access-policies/deny-checked (#2355): the permission that edits access policies, then the mark. */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import WikiRoutes from '../WikiRoutes';

type Routes = { engine: unknown; adminDenyChecked(req: unknown, res: unknown): Promise<unknown>; createWikiContext: unknown; refuse: unknown; askForFreshSignIn: unknown };

describe('POST /admin/access-policies/deny-checked', () => {
  const run = async (held: string[], body: Record<string, unknown> = { id: 'no-docs', fingerprint: 'abc' }, result = 'checked') => {
    const markDenyChecked = vi.fn(async () => result);
    const routes = Object.create(WikiRoutes.prototype) as Routes;
    routes.engine = { getManager: () => ({ markDenyChecked }) };
    const asked: string[] = [];
    routes.createWikiContext = () => ({
      userContext: { username: 'someone' },
      hasPermission: async (p: string) => { asked.push(p); return held.includes(p); },
      holdsPermission: async (p: string) => held.includes(p)
    });
    const refused = vi.fn();
    routes.refuse = refused;
    routes.askForFreshSignIn = vi.fn();
    const redirect = vi.fn();
    await routes.adminDenyChecked({ body }, { redirect });
    return { markDenyChecked, refused, redirect, asked };
  };

  test('refuses a user without the permission that edits access policies, and marks nothing', async () => {
    const { markDenyChecked, refused, redirect, asked } = await run([]);
    expect(asked).toContain('config-manage');
    expect(refused).toHaveBeenCalled();
    expect(markDenyChecked).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  test('a user with the permission marks the deny, and goes back to the dashboard with a plain answer', async () => {
    const { markDenyChecked, redirect } = await run(['config-manage']);
    expect(markDenyChecked).toHaveBeenCalledWith({ username: 'someone' }, 'no-docs', 'abc');
    const to = decodeURIComponent(String(redirect.mock.calls[0][0]));
    expect(to).toMatch(/^\/admin\?success=/);
    expect(to).not.toMatch(/#\d|docs\//);
  });

  test('a rule that changed since the page was shown is not marked, and the answer says to look again', async () => {
    const { redirect } = await run(['config-manage'], { id: 'no-docs', fingerprint: 'abc' }, 'changed');
    expect(decodeURIComponent(String(redirect.mock.calls[0][0]))).toMatch(/^\/admin\?error=.*changed/);
  });

  test('a form with no rule named marks nothing', async () => {
    const { markDenyChecked, redirect } = await run(['config-manage'], {});
    expect(markDenyChecked).not.toHaveBeenCalled();
    expect(String(redirect.mock.calls[0][0])).toMatch(/^\/admin\?error=/);
  });
});

describe('the button on the dashboard item', () => {
  const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views');
  const render = async (locked: boolean) => {
    const html = await ejs.renderFile(path.join(VIEWS, '_degraded-subsystems.ejs'), {
      degradedManagers: [],
      csrfToken: 'tok',
      lockedUnless: () => (locked ? ' disabled aria-disabled="true"' : ''),
      attentionManagers: [{
        manager: 'PolicyEvaluator', state: 'degraded', kind: 'attention', feature: 'Access policies',
        reason: 'Access policies need review (1 problem):', details: ["The rule '<b>x</b>' denies access."],
        buttons: [{ label: "Mark '<b>x</b>' as checked", action: '/admin/access-policies/deny-checked', fields: { id: '<b>x</b>', fingerprint: 'f"p' } }]
      }]
    });
    return new JSDOM(html).window.document;
  };

  test('a form that posts with the CSRF token, the rule and its fingerprint; names are text, not markup', async () => {
    const doc = await render(false);
    const form = doc.querySelector('#subsystems-attention form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('POST');
    expect(form.getAttribute('action')).toBe('/admin/access-policies/deny-checked');
    expect((form.querySelector('[name=_csrf]') as HTMLInputElement).value).toBe('tok');
    expect((form.querySelector('[name=id]') as HTMLInputElement).value).toBe('<b>x</b>');
    expect((form.querySelector('[name=fingerprint]') as HTMLInputElement).value).toBe('f"p');
    expect(form.querySelector('button')?.textContent?.trim()).toBe("Mark '<b>x</b>' as checked");
    expect(doc.querySelector('#subsystems-attention b')).toBeNull();
  });

  test('is locked for someone who cannot change policies', async () => {
    const doc = await render(true);
    expect(doc.querySelector('#subsystems-attention form button')?.hasAttribute('disabled')).toBe(true);
  });
});
