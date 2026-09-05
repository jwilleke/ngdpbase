/**
 * Express type extensions for ngdpbase
 * Extends Express Request and Response with custom properties
 */

import 'express';
import 'express-session';
import type { ShareGrant } from './Share.js';

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    username?: string;
    userId?: string;
    user?: unknown;
    isAuthenticated?: boolean;
    roles?: string[];
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
       */
      userContext?: {
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
      sessionID?: string;
      file?: Multer.File;
      files?: Multer.File[] | { [fieldname: string]: Multer.File[] };
    }
  }
}

export {};
