/**
 * #1576 — the OIDC bearer provider adapts OidcManager's verification into a
 * delegation: the person's username, viaToken (grant, app name, scopes) and
 * the sign-in level. Which providers the middleware tries is selected by
 * `acceptsBearer`, and this one, Authentik's and the agent token's declare it.
 */
import { OidcBearerAuthProvider } from '../OidcBearerAuthProvider';
import { AgentTokenAuthProvider } from '../AgentTokenAuthProvider';
import { bearerProviderIds } from '../../utils/bearerProviders';

const engineWith = (oidc: unknown) => ({ getManager: (n: string) => (n === 'OidcManager' ? oidc : null) }) as never;

describe('OidcBearerAuthProvider (#1576)', () => {
  test('a verified token becomes a delegation with its sign-in level', async () => {
    const provider = new OidcBearerAuthProvider(engineWith({
      verifyAccessToken: (t: string) => Promise.resolve(t === 'good' ? { username: 'jim', clientId: 'app', grantId: 'g1', scopes: ['page-read'], aal: 2 } : null),
      clientName: () => Promise.resolve('Test App')
    }));
    expect(await provider.verify({ token: 'good' })).toEqual({
      username: 'jim',
      viaToken: { id: 'oidc:g1', name: 'Test App', scopes: ['page-read'] },
      aal: 2
    });
    expect(await provider.verify({ token: 'bad' })).toBeNull();
    expect(await provider.verify({})).toBeNull();
  });

  test('without the OidcManager every token fails to verify', async () => {
    expect(await new OidcBearerAuthProvider(engineWith(null)).verify({ token: 'x' })).toBeNull();
  });

  test('the middleware tries providers that accept bearer, in registration order', () => {
    const providers = [
      { id: 'password' },
      new AgentTokenAuthProvider({ getManager: () => null }),
      new OidcBearerAuthProvider(engineWith(null))
    ];
    expect(bearerProviderIds(providers)).toEqual(['agent-token', 'oidc-bearer']);
  });
});
