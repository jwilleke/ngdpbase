/** POST /admin/upgrade/fix answers "fixed" with a count only when the fix changed something. */
import WikiRoutes from '../WikiRoutes';

describe('POST /admin/upgrade/fix', () => {
  const run = async (changed: number) => {
    const routes = Object.create(WikiRoutes.prototype) as { engine: unknown; adminUpgradeFix(req: unknown, res: unknown): Promise<unknown>; createWikiContext: unknown; permitted: unknown };
    routes.engine = { getManager: () => ({ applyFix: async () => changed }) };
    routes.createWikiContext = () => ({ userContext: { username: 'admin' } });
    routes.permitted = async () => true;
    const redirect = vi.fn();
    await routes.adminUpgradeFix({ body: { id: 'pages-nobody-can-edit' } }, { redirect });
    return redirect.mock.calls[0][0] as string;
  };

  test('62 pages changed: fixed, with the count', async () => {
    expect(await run(62)).toBe('/admin/upgrade?result=fixed&count=62');
  });

  test('nothing left to change: the "already fixed" answer, not success', async () => {
    expect(await run(0)).toBe('/admin/upgrade?result=already');
  });
});
