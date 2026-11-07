/**
 * #2261 slice 3 — the bearer provider carries the level stored with a token
 * to the request's `viaToken`, and nothing for a token that has none. It does
 * not set the result's own `aal`: that steps roles down (#1576), and a token's
 * roles are not stepped down by its level.
 */
import AgentTokenAuthProvider from '../AgentTokenAuthProvider';

const providerFor = (record: Record<string, unknown> | null) =>
  new AgentTokenAuthProvider({ getManager: () => ({ verify: async () => record }) });
const rec = { id: 'tok_1', owner: 'quinn', name: 'n', scopes: ['page-read'] };

describe('AgentTokenAuthProvider and the stored level', () => {
  test('a token with a stored level carries it on viaToken', async () => {
    const result = await providerFor({ ...rec, aal: 2 }).verify({ token: 'ngdp_at_x' });
    expect(result?.viaToken).toEqual({ id: 'tok_1', name: 'n', scopes: ['page-read'], aal: 2 });
    expect(result).not.toHaveProperty('aal');
  });

  test('a token made before it was stored carries none', async () => {
    const result = await providerFor(rec).verify({ token: 'ngdp_at_x' });
    expect(result?.viaToken).toEqual({ id: 'tok_1', name: 'n', scopes: ['page-read'] });
    expect(result?.viaToken).not.toHaveProperty('aal');
  });
});
