/**
 * SessionStatsManager — in-process reads of the session store (#1246).
 *
 * Two things want to know how many sessions exist and who holds them: the
 * `/api/session-count` and `/api/session-users` routes, and SessionsPlugin,
 * which renders those numbers into a page. The plugin used to get them by
 * making an HTTP request to this server's own address through a bare global
 * `fetch` — an outbound call outside `src/http/` (#1133) that `guardedFetch`
 * cannot take, because loopback is refused unconditionally (#1186), and one
 * that silently rendered `0` in any container whose configured host was not
 * reachable from inside the process.
 *
 * The store is an in-process object. Nothing about reading it needs a socket.
 * app.ts attaches the store it built for express-session; the routes keep
 * reading `req.sessionStore` (the same object) and both go through the same
 * two helpers, so there is exactly one implementation of "count sessions" and
 * "list session users".
 */

import BaseManager from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';

/** The two optional store methods express-session stores may implement. */
export interface SessionStoreLike {
  length?(callback: (err: unknown, count?: number) => void): void;
  all?(callback: (err: unknown, sessions?: unknown) => void): void;
}

export interface SessionCount {
  sessionCount: number;
  distinctUsers: number;
}

export interface SessionUsers {
  users: string[];
  anonymous: number;
  total: number;
}

/** Thrown when the store implements neither `length` nor `all`. */
export class SessionStoreUnsupportedError extends Error {
  constructor(what: string) {
    super(`Session store does not support ${what}`);
    this.name = 'SessionStoreUnsupportedError';
  }
}

function toArray(sessions: unknown): Record<string, unknown>[] {
  if (Array.isArray(sessions)) return sessions as Record<string, unknown>[];
  if (sessions && typeof sessions === 'object') return Object.values(sessions as Record<string, unknown>) as Record<string, unknown>[];
  return [];
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function storeAll(store: SessionStoreLike): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    store.all!((err, sessions) => (err ? reject(asError(err)) : resolve(toArray(sessions))));
  });
}

function storeLength(store: SessionStoreLike): Promise<number> {
  return new Promise((resolve, reject) => {
    store.length!((err, count) => (err ? reject(asError(err)) : resolve(count || 0)));
  });
}

/**
 * Session count and distinct-user count. Prefers `length` (cheap), falls back
 * to `all`. Under `length` the distinct-user figure equals the session count,
 * which is what the route always reported on that path.
 */
export async function countSessions(store: SessionStoreLike): Promise<SessionCount> {
  if (typeof store.length === 'function') {
    const count = await storeLength(store);
    return { sessionCount: count, distinctUsers: count };
  }
  if (typeof store.all === 'function') {
    const sessions = await storeAll(store);
    const names = new Set<string>();
    for (const s of sessions) names.add(typeof s?.username === 'string' && s.username ? s.username : 'anonymous');
    return { sessionCount: sessions.length, distinctUsers: names.size };
  }
  throw new SessionStoreUnsupportedError('counting');
}

/**
 * Authenticated usernames (sorted, distinct) and the anonymous session count.
 * Needs `all`; under `length` alone the list is empty and every session is
 * reported as anonymous.
 */
export async function listSessionUsers(store: SessionStoreLike): Promise<SessionUsers> {
  if (typeof store.all === 'function') {
    const sessions = await storeAll(store);
    const users = new Set<string>();
    let anonymous = 0;
    for (const s of sessions) {
      if (typeof s?.username === 'string' && s.username) users.add(s.username);
      else anonymous++;
    }
    return { users: Array.from(users).sort(), anonymous, total: sessions.length };
  }
  if (typeof store.length === 'function') {
    const count = await storeLength(store);
    return { users: [], anonymous: count, total: count };
  }
  throw new SessionStoreUnsupportedError('listing users');
}

class SessionStatsManager extends BaseManager {
  private store: SessionStoreLike | null = null;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  /** app.ts hands over the store it built for express-session. */
  attachStore(store: SessionStoreLike): void {
    this.store = store;
  }

  hasStore(): boolean {
    return this.store !== null;
  }

  /** @throws Error when no store is attached; SessionStoreUnsupportedError when it cannot count. */
  async count(): Promise<SessionCount> {
    if (!this.store) throw new Error('Session store not attached');
    return countSessions(this.store);
  }

  /** @throws Error when no store is attached; SessionStoreUnsupportedError when it cannot list. */
  async users(): Promise<SessionUsers> {
    if (!this.store) throw new Error('Session store not attached');
    return listSessionUsers(this.store);
  }
}

export default SessionStatsManager;
