/**
 * OidcBearerAuthProvider — accepts access tokens issued by this instance's own
 * OpenID Connect provider on ngdpbase's API (#1576).
 *
 * An app that a person allowed through /oidc holds a token for the audience
 * `<base-url>/api`. That token is a delegation from the person, like an agent
 * token: its scopes are permission names and ride on `viaToken`, so the PDP
 * ceiling and the edge gate (#1173) bound it exactly as they bound an agent
 * token, and authority stays the person's, resolved live. Unlike an agent
 * token it also carries how the person signed in, so roles above that level
 * step down (`aal`), as in a web session.
 *
 * Verification is OidcManager's, in process; this provider only adapts it.
 */
import type { AuthProvider, AuthResult, AuthVerifyCredentials, ViaToken } from './BaseAuthProvider.js';
import type { OidcManager } from '../managers/OidcManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';

export interface OidcBearerAuthResult extends AuthResult {
  viaToken: ViaToken;
  aal: 1 | 2 | 3;
}

export class OidcBearerAuthProvider implements AuthProvider {
  readonly id = 'oidc-bearer';
  readonly displayName = 'OpenID Connect access token';
  /** Marks this provider as usable by the bearer middleware. */
  readonly acceptsBearer = true;

  constructor(private readonly engine: WikiEngine) {}

  async verify(credentials: AuthVerifyCredentials): Promise<OidcBearerAuthResult | null> {
    const token = credentials?.token;
    if (typeof token !== 'string' || token.length === 0) return null;
    const oidc = this.engine.getManager<OidcManager>('OidcManager');
    const verified = await oidc?.verifyAccessToken(token);
    if (!verified) return null;
    const name = await oidc!.clientName(verified.clientId);
    return {
      username: verified.username,
      // The grant, not the token: a token rotates; the grant is what the person allowed.
      viaToken: { id: `oidc:${verified.grantId}`, name, scopes: verified.scopes },
      aal: verified.aal
    };
  }
}

export default OidcBearerAuthProvider;
