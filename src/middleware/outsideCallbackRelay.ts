/**
 * The POSTed outside sign-in callback, turned into the usual GET (#1743 slice 4b).
 *
 * Apple sends the browser back with `response_mode=form_post`: an
 * auto-submitting form on appleid.apple.com POSTs `code`, `state` (and, on a
 * first sign-in, a `user` JSON with the person's name) to
 * `/auth/oauth/<name>/callback`. That is a cross-site top-level POST, and
 * every cookie this site sets is `SameSite=Lax`, so the browser sends neither
 * the session cookie nor the HTTP-only `ngdp_oauth_state` cookie that binds
 * the flow to the browser that started it (#1630). Finishing the sign-in on
 * that POST would mean dropping the binding; and letting the session
 * middleware see it would start a fresh session whose `Set-Cookie` replaces
 * the person's own (signing them out, losing a connection in progress).
 *
 * So this relay is mounted before the session and CSRF middleware and answers
 * the POST at once with a 303 to the same callback as a GET, carrying only
 * `code`, `state` and `error`. That GET is a top-level navigation, so the Lax
 * cookies go with it, and the normal finish runs with every check intact:
 * the state, the browser binding, PKCE, nonce and the ID token. The `user`
 * field is dropped: a name the provider sends unsigned never identifies anyone.
 *
 * Nothing is weakened: the POST does nothing but redirect, so a forged POST
 * achieves only what a forged link to the GET callback already could, which
 * the browser binding refuses. The code lands in the URL, as it does in every
 * provider's ordinary code flow, and is single-use and PKCE-bound. Only a
 * provider that AuthManager says POSTs its callback (`callbackIsPosted`) is
 * relayed; any other POST falls through to the CSRF check, which refuses it.
 */
import type { Request, Response, NextFunction } from 'express';

/** The callback path the relay is mounted on; `:name` is the provider's entry name. */
export const OUTSIDE_CALLBACK_PATH = '/auth/oauth/:name/callback';

const NAME = /^[a-z0-9][a-z0-9-]*$/;
/** What the provider's POST may carry on to the GET callback; anything else is dropped. */
const RELAYED = ['code', 'state', 'error'] as const;

/** Asks AuthManager whether a provider POSTs its callback. */
export type CallbackIsPosted = (providerId: string) => boolean;

export function outsideCallbackRelay(callbackIsPosted: CallbackIsPosted) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const name = typeof req.params?.name === 'string' ? req.params.name : '';
    if (!NAME.test(name) || !callbackIsPosted(`oidc:${name}`)) { next(); return; }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const query = new URLSearchParams();
    for (const key of RELAYED) {
      const value = body[key];
      if (typeof value === 'string' && value !== '') query.set(key, value);
    }
    res.set('Cache-Control', 'no-store');
    res.redirect(303, `/auth/oauth/${name}/callback?${query.toString()}`);
  };
}
