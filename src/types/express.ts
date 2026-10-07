/// <reference types="express" preserve="true" />
/// <reference types="express-session" preserve="true" />
/// <reference types="multer" preserve="true" />
/**
 * Express type extensions for ngdpbase: `req.userContext`, `req.session`'s
 * fields, uploads.
 *
 * A module, not a hand-written `.d.ts` (#1665): tsc emits
 * `dist/src/types/express.d.ts` from it, and `src/context/ApiContext.ts`
 * imports it, so an add-on that typechecks against `dist/` — bundled or
 * external — sees these properties through the types it already imports, with
 * no tsconfig entry. A hand-written `.d.ts` was never emitted, so external
 * add-ons could not see it at all.
 *
 * Being a module also ends the restated copies the `.d.ts` needed: the share
 * and sign-in shapes are imported, not transcribed.
 */
import type { ShareGrant } from './Share.js';
import type { SignInRecord } from '../managers/AuthManager.js';

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
    signIn?: SignInRecord;
    /** A pending WebAuthn challenge (#448): single-use, tied to its purpose, short-lived. */
    passkeyChallenge?: { value: string; purpose: 'register' | 'authenticate' | 'reauth'; expires: number };
    /** A sign-in waiting for its second factor: the handle, and where to go after (#1523). No identity yet. */
    pendingSignIn?: string;
    pendingRedirect?: string;
    /** When this session last made a request, epoch ms — kept only while an idle timeout is set (#1546). */
    lastActivity?: number;
    [key: string]: unknown;
  }
}

declare global {
  // Express declares Request in its global `Express` namespace; augmenting it
  // means reopening that namespace. The rule skipped this when it was a .d.ts.
  // eslint-disable-next-line @typescript-eslint/no-namespace
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
        viaShare?: ShareGrant;
        [key: string]: unknown;
      };
      file?: Multer.File;
      files?: Multer.File[] | { [fieldname: string]: Multer.File[] };
    }
  }
}

export {};
