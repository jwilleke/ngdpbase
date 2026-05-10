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

Then create a page with the slug `join-our-team`. Any normal page slug works —
there's no special namespace.

> **Note on the URL shape.** The header **Request access** button always renders
> as `/view/<redirect-page-slug>`. The slug is resolved as a *page* lookup, not
> an arbitrary URL. So you cannot set `redirect-page` to a route name like
> `contact` and expect the button to hit the built-in `/contact` *route* —
> it will go to `/view/contact` (a page lookup) instead. To send users at the
> `/contact` route directly, see **Routing to the `/contact` route** below.

---

## Seeded pages: `request-access` and `contact-us`

Two required pages ship with the installer and are auto-created on first boot:

| Slug | Title | What it does |
|---|---|---|
| `request-access` | Request access | The default registration redirect target. Body explains that registration is closed and links to `[Contact Us]`. |
| `contact-us` | Contact Us | What the `[Contact Us]` link from `request-access` resolves to. Generic operator-overridable copy. |

So out of the box, with `ngdpbase.application.registration: false`, the visitor
flow is:

```
Header "Request access" button
   → /view/request-access  (page: "registration is closed, please [Contact Us]")
   → [Contact Us] link
   → /view/contact-us       (page: "if you need to reach the administrators…")
```

Both pages are normal versioned pages — edit them via the system UI (sign in as
admin → navigate → Edit). Edit history, ACLs, and reverts all work as usual.

### Common shapes

- **Stay with the two-page chain** — no config beyond `registration: false`. Edit `request-access` and/or `contact-us` to suit your tone.
- **Skip the intermediate page** — drop visitors straight on the contact page:

  ```json
  {
    "ngdpbase.application.registration": false,
    "ngdpbase.application.registration.redirect-page": "contact-us"
  }
  ```

- **Embedded contact form on the redirect page** — drop a `[{Form …}]` plugin invocation onto whichever page the button lands on. See [`docs/admin/email-setup.md`](./email-setup.md) for the contact-form recipient resolution rules. Form submissions route to whichever address `ngdpbase.application.contact.recipient` resolves to.
- **External link** — redirect to a SaaS form (Google Forms, Typeform, etc.) by linking out from the page body. The header button still lands the visitor on the configured `redirect-page` first.

---

## Routing to the `/contact` route

Separately from the seeded pages, ngdpbase also ships a built-in `/contact`
*route* (added in v3.11.0, issue #658). This is a different mechanism with its
own config keys:

| Key | Default | Description |
|---|---|---|
| `ngdpbase.application.contact.enabled` | `true` | Master toggle. `false` → `/contact` returns 404. |
| `ngdpbase.application.contact.page` | `""` | If set to a slug, `/contact` 302-redirects to `/view/<slug>` (operator-owned page). If empty, `/contact` renders the built-in form view. |
| `ngdpbase.application.contact.recipient` | `""` | Email recipient(s). Empty resolves at request time to the first admin user whose email isn't the install-default sentinel. |

The `/contact` route does **not** automatically wire to the registration
redirect button. To send the **Request access** button at `/contact` directly,
the simplest option today is to point the registration redirect at a page that
itself links or redirects to `/contact`:

```json
{
  "ngdpbase.application.registration": false,
  "ngdpbase.application.registration.redirect-page": "contact-us"
}
```

…and then edit the `contact-us` page to include a prominent link to
`/contact` (or a meta-refresh).

A future change may add a first-class config option to point the registration
button straight at the `/contact` route without an intermediate page.

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

- [`config/app-default-config.json`](../../config/app-default-config.json) — the base defaults, including the inline `_comment_application_registration` and `_comment_application_contact` fields that document each feature's behaviour.
- [`docs/admin/email-setup.md`](./email-setup.md) — needed if the redirect page uses a contact form (`[{Form …}]` plugin), or if the built-in `/contact` route is configured to send mail.
- `required-pages/519febcc-b640-4a0e-a495-4c4db655484b.md` — the seeded `request-access` page source.
- `required-pages/c0a01d19-4558-482d-a485-a94ed3ff1729.md` — the seeded `contact-us` page source.
- `src/routes/WikiRoutes.ts` (`registerPage`, `processRegister`) — registration-form handlers that 404 when the flag is off.
- `src/routes/WikiRoutes.ts` (`contactPage`, `processContact`) — the `/contact` route handlers (state matrix described above).
- `src/providers/GoogleOIDCProvider.ts` (`authenticate`) — OIDC auto-provisioning path that defers to the registration flag as an override.
