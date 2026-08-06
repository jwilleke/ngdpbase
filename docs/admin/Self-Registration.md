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
| `ngdpbase.application.registration` | `true` | Master toggle. `false` disables **every** signup path and changes the header button. |
| `ngdpbase.application.registration.password` | `true` | Password `/register` form only (#1026). `false` 404s the form while leaving other signup paths working. |
| `ngdpbase.application.registration.redirect-page` | `"request-access"` | Slug of the page the **Request access** button links to. Operator-editable through the normal page-edit UI. |

### How the layers fit together

Registration is a master policy with one toggle per mechanism beneath it. The master answers *may any path create an account*; each mechanism answers *may this particular door*.

```text
master : application.registration             = true
  ├ password form : registration.password     = true
  ├ magic link    : auth.magic-link.auto-provision = false
  └ google oidc   : auth.google-oidc.auto-provision
```

With the master `false`, every mechanism below it is off regardless of its own setting.

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

## Magic-link-only signup (#1026)

To run an instance where an **email link is the only way to get an account** — no passwords issued to self-registered users at all:

```json
{
  "ngdpbase.application.registration": true,
  "ngdpbase.application.registration.password": false,
  "ngdpbase.auth.magic-link.enabled": true,
  "ngdpbase.auth.magic-link.auto-provision": true,
  "ngdpbase.auth.magic-link.registration.default-role": "contributor",
  "ngdpbase.mail.enabled": true,
  "ngdpbase.application.base-url": "https://wiki.example.com"
}
```

| Key | Default | Description |
|---|---|---|
| `ngdpbase.auth.magic-link.auto-provision` | `false` | `true` lets an address with no account receive a link and have the account created when that link is verified. |
| `ngdpbase.auth.magic-link.registration.default-role` | `"reader"` | Role given to those accounts. An unknown role name falls back to `reader` with a warning. |

Behaviour worth knowing:

- **The account is created on verify, not on request.** An address nobody controls never becomes an account, and requests sprayed at other people's addresses leave nothing behind.
- **These accounts have no password.** They are created `isExternal`, which stores an empty password hash; `verifyPassword` compares a SHA-256 digest against it and a digest is never empty, so no password input can ever log them in.
- **Unknown addresses stay unenumerable.** A known and an unknown address get the same response, status and timing. Only the recipient sees the difference.
- **`base-url` must be set explicitly** or the magic-link provider refuses to register at all (#642) — a token in a URL is a credential and must not point at the localhost default.
- **Tokens live in memory.** A restart invalidates every outstanding link.

> **Anti-abuse.** Open magic-link signup means anyone can make the instance send mail to any address they type. `POST /register` and `POST /auth/magic-link` share the per-IP budget in `ngdpbase.mail.rate-limit.*` — keep it enabled on any public instance. Relay free tiers are commonly ~100 sends/day, and an unthrottled script exhausts that quickly enough that links stop arriving for real users.

---

## Routing to the `/contact` route

Separately from the seeded pages, ngdpbase also ships a built-in `/contact` *route* (originally #658, extended through #670). The keys most relevant to registration composition:

| Key | Default | Description |
|---|---|---|
| `ngdpbase.application.contact.enabled` | `true` | Master toggle. `false` → `/contact` returns 404. |
| `ngdpbase.application.contact.recipient` | `""` | Empty resolves at request time to the first admin user whose email isn't the install-default sentinel `admin@localhost`. Accepts a single address or an inline CSV. |

For the full `/contact` configuration surface — footer-link toggle, JSONL submission persistence, anti-spam (honeypot + per-IP rate limit), state matrix, recipient patterns — see [`Contact-Us.md`](./Contact-Us.md). What follows here is just the part that interacts with the registration toggle.

> **Mail must be working.** Since #670 Phase B (v3.11.5), `/contact` renders "not configured" rather than the form when `ngdpbase.mail.enabled` is `false` or no recipient resolves. If you build a registration → page-chain → `/contact` flow but mail isn't configured, visitors land on the warning page, not the form. See [`email-setup.md`](./email-setup.md).

The `/contact` route does **not** automatically wire to the registration redirect button. To send the **Request access** button at `/contact` directly, the simplest option is to point the registration redirect at a page that itself links to `/contact`:

```json
{
  "ngdpbase.application.registration": false,
  "ngdpbase.application.registration.redirect-page": "contact-us"
}
```

…and then edit the `contact-us` page to include a prominent link to `/contact` (or a meta-refresh).

### Two paths after #670 Phase A

With #670 Phase A (v3.11.4), `/contact` got its own footer link rendered on every page when the contact feature is fully available (`contact.enabled` + `mail.enabled` + a recipient resolves). With both the footer link and a locked registration, visitors now have two paths:

- **Header *Request access* button** → seeded page chain (`/view/request-access` → `[Contact Us]` link → `/view/contact-us`). Operator-curated copy; can include calls-to-action other than mail.
- **Footer *Contact* link** → `/contact` directly. Built-in form, immediate submission.

The header button still hard-codes `/view/<slug>` and is not being re-pointed at the `/contact` route. That's a deliberate design choice, not a planned change — the footer link covers the discoverability need from a different angle, and the page-chain remains useful for operators who want a curated landing page before the form.

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
