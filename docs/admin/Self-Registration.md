# Self-Registration

ngdpbase ships with self-registration **on** by default — anyone can create an
account from the `/register` form. For public-internet deploys, internal
intranets, or any instance where account creation should be operator-mediated,
turn it off via a single config flag.

This applies to every deploy mode equally — host with PM2, Docker, Kubernetes,
or `npm run dev`. The flag is read at request time, not at boot, so changing it
takes effect on the next request after a config reload (or restart).

---

## What the flag does

| Setting | Effect |
|---|---|
| `ngdpbase.application.registration: true` (default) | `/register` form available; header shows a **Register** button; OIDC providers may auto-provision new users (subject to each provider's own toggle). |
| `ngdpbase.application.registration: false` | `/register` returns **404** (both `GET` and `POST`); header button changes to **Request access** linking to a configurable wiki page; OIDC providers reject sign-ins from email addresses that don't already have an account. |

What is **not** affected when the flag is `false`:

- **Login** — every login path works normally for accounts that already exist (password, magic-link, OIDC for known users).
- **Admin-created users** — admins can still create accounts manually via the admin UI / `UserManager` API.
- **Existing OIDC users** — anyone who signed in via Google OIDC before the flag was turned off keeps logging in normally; only **new** OIDC sign-ins are rejected.

---

## Configuration

Two related keys, both in your instance config at
`$FAST_STORAGE/config/app-custom-config.json`:

| Key | Default | Description |
|---|---|---|
| `ngdpbase.application.registration` | `true` | Master toggle. `false` disables `/register` and changes the header button. |
| `ngdpbase.application.registration.redirect-page` | `"request-access"` | Slug of the wiki page the **Request access** button links to. Operator-editable through the normal page-edit UI. |

### Minimal example — disable self-registration

```json
{
  "ngdpbase.application.registration": false
}
```

That's it. The default redirect page (`request-access`) is seeded automatically
on fresh installs at v3.10.6 or later, so there's nothing else to wire.

### Custom redirect page

If you'd rather route the **Request access** button somewhere other than
`/view/request-access`:

```json
{
  "ngdpbase.application.registration": false,
  "ngdpbase.application.registration.redirect-page": "join-our-team"
}
```

Then create a wiki page with the slug `join-our-team`. Any normal page slug
works — there's no special namespace.

---

## The `request-access` page

The default `request-access` page is a normal wiki page seeded at install time.
Edit it via the wiki UI (sign in as admin → navigate to `/view/request-access`
→ Edit). Common patterns:

- **Plain instructions**: "Email `admin@example.com` with your name and the team you're joining" — the simplest case, no extra moving parts.
- **Embedded contact form**: drop a `[{Form …}]` plugin invocation onto the page — see [`docs/admin/email-setup.md`](./email-setup.md) for the contact-form recipient resolution rules. This routes form submissions to whichever address `ngdpbase.application.contact.recipient` resolves to.
- **External link**: redirect to a SaaS form (Google Forms, Typeform, etc.) by linking out from the page body. The page itself remains static; the **Request access** button still lands the visitor on `/view/request-access` first.

The page is a normal versioned wiki page — edit history, ACLs, and reverts all
work as usual.

---

## Verifying the lockdown

After setting `ngdpbase.application.registration: false` and reloading config (or
restarting the instance), check each surface:

| What | Expected result |
|---|---|
| `GET /register` | HTTP 404 (page reads "Not found") |
| `POST /register` | HTTP 404 (defence in depth — direct posts also rejected) |
| Header button (logged out, on any page) | Reads **Request access**, links to `/view/<redirect-page>` |
| Header button (logged in) | Unchanged — register/request-access button is hidden when authenticated |
| Google OIDC sign-in by an existing user | Works normally |
| Google OIDC sign-in by a new email | Rejected at the provider with a log line: `[GoogleOIDCProvider] Registration disabled — rejecting new OIDC user: <email>` |
| Login form (`/login`) | Works normally |
| Magic-link sign-in for an existing user | Works normally |
| Admin "Add user" UI | Works normally |

If any of those don't match, the most likely cause is the flag living in the
wrong file (e.g., edited `config/app-default-config.json` in the source tree
instead of the instance-side `$FAST_STORAGE/config/app-custom-config.json`).
The base default is read first, then overridden by the custom config — only
the custom file should be edited on a deployed instance.

---

## Related

- [`config/app-default-config.json`](../../config/app-default-config.json) — the base defaults, including the inline `_comment_application_registration` field that documents the flag's behaviour.
- [`docs/admin/email-setup.md`](./email-setup.md) — needed if the `request-access` page uses a contact form (`[{Form …}]` plugin) for routing requests via mail.
- `src/routes/WikiRoutes.ts` (`registerPage`, `processRegister`) — registration-form handlers that 404 when the flag is off.
- `src/providers/GoogleOIDCProvider.ts` (`authenticate`) — OIDC auto-provisioning path that defers to this flag as an override.
