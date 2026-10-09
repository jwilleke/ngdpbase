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
  /** session-file-store: the session file names, not the sessions. */
  list?(callback: (err: unknown, files?: string[]) => void): void;
  get?(sid: string, callback: (err: unknown, session?: unknown) => void): void;
  /** session-file-store keeps its file extension here (default `.json`). */
  options?: { fileExtension?: string };
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

/**
 * Every session in a store that has no `all()` but can list and read
 * (session-file-store, the default store). Each file name is turned back into
 * its session id and read through the store's own `get`, which also removes
 * an expired one. A session that cannot be read is left out: express-session
 * cannot load it either, so it is not a live session.
 */
async function storeListAndGet(store: SessionStoreLike): Promise<Record<string, unknown>[]> {
  const files = await new Promise<string[]>((resolve, reject) => {
    store.list!((err, list) => (err ? reject(asError(err)) : resolve(Array.isArray(list) ? list : [])));
  });
  const extension = store.options?.fileExtension ?? '.json';
  const sessions: Record<string, unknown>[] = [];
  for (const file of files) {
    const sid = extension && file.endsWith(extension) ? file.slice(0, -extension.length) : file;
    const session = await new Promise<unknown>((resolve) => {
      store.get!(sid, (err, s) => resolve(err ? null : s));
    });
    if (session && typeof session === 'object') sessions.push(session as Record<string, unknown>);
  }
  return sessions;
}

/**
 * The private-store handles held by sessions still in the store (#1626).
 * Uses `all()` where the store has it, else lists and reads each session:
 * the file store has no `all()`, so the sweep failed on every run there and
 * no orphaned key was ever dropped.
 */
export async function liveSessionHandles(store: SessionStoreLike): Promise<Set<string>> {
  let sessions: Record<string, unknown>[];
  if (typeof store.all === 'function') sessions = await storeAll(store);
  else if (typeof store.list === 'function' && typeof store.get === 'function') sessions = await storeListAndGet(store);
  else throw new SessionStoreUnsupportedError('listing sessions');
  const handles = new Set<string>();
  for (const s of sessions) {
    if (typeof s?.privateStoreHandle === 'string' && s.privateStoreHandle) handles.add(s.privateStoreHandle);
  }
  return handles;
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

  /** @throws Error when no store is attached; SessionStoreUnsupportedError when it cannot list. */
  async liveHandles(): Promise<Set<string>> {
    if (!this.store) throw new Error('Session store not attached');
    return liveSessionHandles(this.store);
  }
}

export default SessionStatsManager;
