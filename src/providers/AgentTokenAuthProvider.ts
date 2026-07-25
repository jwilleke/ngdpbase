/**
 * AgentTokenAuthProvider — verify a user-delegated agent API token presented
 * on the `Authorization: Bearer <token>` header (#946).
 *
 * Counterpart to AuthentikBearerAuthProvider, but with no external IdP: the
 * credential is minted in-app by the user it belongs to. Both providers can be
 * enabled at once — the bearer middleware tries each registered bearer-capable
 * provider in turn.
 *
 * The provider only answers "which user, and with which scopes". Permissions
 * are resolved live from that user's record by the middleware, so a token
 * never carries a snapshot of its owner's authority.
 *
 * Wire-up: request-time middleware in `src/app.ts` (header → verify →
 * set req.userContext). Stateless — no session is created for API calls. It
 * does NOT participate in the /login flow.
 */

import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type AgentTokenManager from '../managers/AgentTokenManager.js';
import type {
  AuthProvider,
  AuthVerifyCredentials,
  AuthResult
} from './BaseAuthProvider.js';

/** Extra detail this provider returns alongside the username. */
export interface AgentTokenAuthResult extends AuthResult {
  viaToken: {
    id: string;
    name: string;
    scopes: string[];
  };
}

export class AgentTokenAuthProvider implements AuthProvider {
  readonly id = 'agent-token';
  readonly displayName = 'Agent API Token';
  /** Marks this provider as usable by the bearer middleware. */
  readonly acceptsBearer = true;

  private engine: WikiEngine;

  constructor(engine: WikiEngine) {
    this.engine = engine;
  }

  async verify(credentials: AuthVerifyCredentials): Promise<AgentTokenAuthResult | null> {
    const token = credentials?.token;
    if (typeof token !== 'string' || token.length === 0) return null;

    const manager = this.engine.getManager<AgentTokenManager>('AgentTokenManager');
    if (!manager) {
      logger.warn('[agent-token] AgentTokenManager not available — cannot verify');
      return null;
    }

    const record = await manager.verify(token);
    if (!record) return null;

    return {
      username: record.owner,
      viaToken: { id: record.id, name: record.name, scopes: record.scopes }
    };
  }
}

export default AgentTokenAuthProvider;
