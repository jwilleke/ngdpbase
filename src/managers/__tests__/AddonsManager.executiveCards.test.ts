/**
 * #2093 — add-ons register Executive Hub cards through the same
 * `registerDashboardCard` as their /admin cards, with `surface: 'executive'`.
 * An executive card names the permission a viewer must hold, and its figures
 * are read with the viewer's context.
 *
 * Sabotaged once each (then restored), and the named test went red:
 * - the permits filter skipped in executiveCardsFor: "a card is shown only to a viewer the PDP permits";
 * - the store keyed by add-on name alone: "one add-on may have an admin card and an executive card".
 */
import AddonsManager from '../AddonsManager';

const viewer = { username: 'dana', roles: ['executive'], isAuthenticated: true };

function manager(granted: string[]) {
  const permits = vi.fn((_ctx: unknown, p: string) => Promise.resolve(granted.includes(p)));
  const engine = { getManager: (n: string) => (n === 'PolicyDecisionPoint' ? { permits } : null) };
  return { addons: new AddonsManager(engine), permits };
}

const adminCard = { addonName: 'forms', title: 'Forms', icon: 'fas fa-wpforms', adminUrl: '/addons/forms' };

describe('#2093 executive cards', () => {
  test('a card with no surface is an /admin card, as before', () => {
    const { addons } = manager([]);
    addons.registerDashboardCard(adminCard);
    expect(addons.getDashboardCards()).toEqual([{ ...adminCard, surface: 'admin' }]);
    expect(addons.getDashboardCards('executive')).toEqual([]);
  });

  test('one add-on may have an admin card and an executive card', () => {
    const { addons } = manager([]);
    addons.registerDashboardCard(adminCard);
    addons.registerDashboardCard({ ...adminCard, title: 'Forms waiting', surface: 'executive', permission: 'form-read' });
    expect(addons.getDashboardCards().map(c => c.title)).toEqual(['Forms']);
    expect(addons.getDashboardCards('executive').map(c => c.title)).toEqual(['Forms waiting']);
  });

  test('an executive card with no permission is refused', () => {
    const { addons } = manager([]);
    expect(() => addons.registerDashboardCard({ ...adminCard, surface: 'executive' })).toThrow(/no permission/);
  });

  test('a card for an unknown surface is refused', () => {
    const { addons } = manager([]);
    expect(() => addons.registerDashboardCard({ ...adminCard, surface: 'board' as never })).toThrow(/'admin' or 'executive'/);
  });

  test('a card is shown only to a viewer the PDP permits, asked with their context', async () => {
    const { addons, permits } = manager(['ledger-read']);
    addons.registerDashboardCard({ ...adminCard, addonName: 'accounting', surface: 'executive', permission: 'ledger-read' });
    addons.registerDashboardCard({ ...adminCard, addonName: 'phr', surface: 'executive', permission: 'health-read' });
    const cards = await addons.executiveCardsFor(viewer);
    expect(cards.map(c => c.addonName)).toEqual(['accounting']);
    expect(permits).toHaveBeenCalledWith(viewer, 'ledger-read');
    expect(permits).toHaveBeenCalledWith(viewer, 'health-read');
  });

  test('the figures are read with the viewer\'s context', async () => {
    const { addons } = manager(['ledger-read']);
    const summary = vi.fn(() => Promise.resolve({ figures: [{ label: 'Funds', value: '$12,400.00' }, { label: 'Units owing', value: 3 }], message: 'As of today' }));
    addons.registerDashboardCard({ ...adminCard, addonName: 'accounting', surface: 'executive', permission: 'ledger-read', summary });
    const [card] = await addons.executiveCardsFor(viewer);
    expect(summary).toHaveBeenCalledWith(viewer);
    expect(card).toMatchObject({ figures: [{ label: 'Funds', value: '$12,400.00' }, { label: 'Units owing', value: 3 }], message: 'As of today', failed: false });
  });

  test('a summary that throws shows the card marked as not read', async () => {
    const { addons } = manager(['ledger-read']);
    addons.registerDashboardCard({
      ...adminCard, addonName: 'accounting', surface: 'executive', permission: 'ledger-read',
      summary: () => Promise.reject(new Error('Pat Lee owes 300'))
    });
    const [card] = await addons.executiveCardsFor(viewer);
    expect(card).toMatchObject({ failed: true, figures: [], message: '' });
  });

  test('no context shows no cards', async () => {
    const { addons } = manager(['ledger-read']);
    addons.registerDashboardCard({ ...adminCard, addonName: 'accounting', surface: 'executive', permission: 'ledger-read' });
    expect(await addons.executiveCardsFor(null)).toEqual([]);
  });
});
