/**
 * Express type extensions for ngdpbase
 * Extends Express Request and Response with custom properties
 */

import 'express';
import 'express-session';

/**
 * The share a request presented (#1222), structurally identical to
 * `ShareGrant` in `src/types/Share.ts`. Declared inline ON PURPOSE: the
 * bundled addons compile with `rootDir`/`outDir` at the repo root and include
 * every `.d.ts` under `src/types/` for this augmentation, so an `import` here pulls the
 * imported module into every addon program and tsc emits `src/types/Share.js`
 * in place beside its source (seen on every satellite after v4.15.0). A
 * `.d.ts` must not import a `.ts` module.
 */
/**
 * How a session signed in (#1523), structurally identical to `SignInRecord`
 * in `src/managers/AuthManager.ts`. Inline for the reason above: importing it
 * would compile AuthManager and everything it imports into every addon build.
 */
interface SessionSignIn {
  provider: string;
  factors: Array<{ provider: string; amr: string[]; aal: 0 | 1 | 2 | 3; acr?: 'phr' | 'phrh'; at: string }>;
  amr: string[];
  aal: 0 | 1 | 2 | 3;
  acr: 'phr' | 'phrh' | 'aal1' | 'aal2' | 'aal3';
  mfa: boolean;
  at: string;
}

interface RequestShareGrant {
  id: string;
  issuer: string;
  actions: string[];
  resources: Array<{ type: string; pattern: string }>;
  expiresAt: string | null;
}

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    username?: string;
    userId?: string;
    user?: unknown;
    isAuthenticated?: boolean;
    roles?: string[];
    /** Opaque handle to this session's private-store key bag (#1382). Random, never the session id; never key bytes. */
    privateStoreHandle?: string;
    /** The account's password-change generation when this session signed in (#1482). */
    sessionGeneration?: number;
    /** How this session signed in: provider, factors with their times, amr / aal / acr (#1523). */
    signIn?: SessionSignIn;
    /** When this session last made a request, epoch ms — kept only while an idle timeout is set (#1546). */
    lastActivity?: number;
    [key: string]: unknown;
  }
}

declare global {
  namespace Express {
    interface Request {
      /**
       * The identity this request carries, written by the session and bearer
       * middleware in `app.ts`.
       *
       * __`viaToken` is declared here deliberately (#1164, #1173).__ It was
       * absent while `app.ts` wrote it and every route read it, so the type
       * described a user with no delegation. `ApiContext.from()` copied "the
       * fields" — the fields the TYPE named — and the token was gone before
       * any permission check ran. Reaching it required a cast, and a cast is
       * what a wrong type feels like from the inside.
       *
       * A token is a __delegation from this user__, not a separate actor: it
       * carries the permissions they delegated, and authority is still the
       * user's, resolved live. So it belongs on the identity, beside them.
       *
       * The `[key: string]: unknown` index signature below is why none of this
       * was a compile error — it permits any field, so omitting one is always
       * legal. Removing it is what would make a dropped field fail the build;
       * that is a larger change and is not made here.
       *
       * __Required, not optional (#1418).__ The session middleware in `app.ts`
       * writes it on every request before any route is registered — the
       * signed-in user, the anonymous subject, or (bearer middleware) the
       * token's subject — and nothing registered ahead of it reads it. Typed
       * optional, every route had to invent something for the case that
       * cannot happen, and the thing invented was a default actor (P1). A
       * handler forwards `req.userContext`; it never supplies one.
       */
      userContext: {
        /** #1212: the three authorisation fields are required — the session and bearer middleware always write them. */
        username: string;
        email?: string;
        displayName?: string;
        roles: string[];
        isAuthenticated: boolean;
        authenticated?: boolean;
        isSystem?: boolean;
        permissions?: string[];
        /** The agent token this request arrived with, when it did. */
        viaToken?: { id: string; name: string; scopes: string[] };
        /** The share this request presented, when it did (#1222). Forwarded like `viaToken`. */
        viaShare?: RequestShareGrant;
        [key: string]: unknown;
      };
      sessionID?: string;
      file?: Multer.File;
      files?: Multer.File[] | { [fieldname: string]: Multer.File[] };
    }
  }
}

export {};
