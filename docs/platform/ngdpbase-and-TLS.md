# ngdpbase and TLS

How an instance serves HTTPS, what it refuses to do, and what an operator has to decide.

Three mechanisms, built separately and interacting: __terminating TLS__ ([#1153](https://github.com/jwilleke/ngdpbase/issues/1153)), __redirecting plain HTTP to it__ ([#1163](https://github.com/jwilleke/ngdpbase/issues/1163)), and __the session cookie and proxy trust that depend on both__ ([#1046](https://github.com/jwilleke/ngdpbase/issues/1046), [#1160](https://github.com/jwilleke/ngdpbase/issues/1160)).

The __decisions__ behind them live in [security-posture.md](../security-posture.md) — this document is the operational half, and points back at the decision that governs each behaviour rather than restating it. The ones that bear on TLS are [D6](../security-posture.md#d6-restart-requirements-are-per-item-and-the-ui-must-say-so), [D9](../security-posture.md#d9-a-fatal-configuration-entry-boots-into-maintenance-mode-not-a-dead-process)–[D12](../security-posture.md#d12-configuration-blocked-is-engineready-false), [D13](../security-posture.md#d13-deployment-methodology-does-not-influence-the-design), [D15](../security-posture.md#d15-the-ingredients-of-the-shipped-posture), [D17](../security-posture.md#d17-the-recommendations-ship-as-required-pages-carrying-an-accountability-disclaimer), [D20](../security-posture.md#d20-the-instance-never-scores-itself-against-a-recommended-posture) and [D21](../security-posture.md#d21-the-report-is-not-called-guarantees).

## The two deployment shapes

An ngdpbase instance either terminates TLS itself or sits behind something that does. Almost every question below has a different answer depending on which.

| | __Native TLS__ | __Behind a proxy__ |
|---|---|---|
| Who holds the certificate | this instance | the proxy |
| `ngdpbase.server.tls.*` | set | empty |
| `ngdpbase.server.trust-proxy` | leave unset | __must__ be set |
| How the scheme is known | the bytes on the socket | the `X-Forwarded-Proto` header |
| HTTP → HTTPS redirect | done by this instance | the proxy's job |

__The instance takes no view on which you are running.__ It cannot: nothing on the machine can verify what sits in front of it. It reports what it is doing and the operator states what the deployment is — [D13](../security-posture.md#d13-deployment-methodology-does-not-influence-the-design) (deployment methodology is not an input to the design) and [D21](../security-posture.md#d21-the-report-is-not-called-guarantees) (state facts, do not claim). Which of these two shapes you are in is a fact about your deployment that only you can assert, which is why there is no key naming it.

## Terminating TLS

Two keys, and both must be set:

```json
"ngdpbase.server.tls.cert-file": "/path/to/fullchain.crt",
"ngdpbase.server.tls.key-file":  "/path/to/private.key"
```

Set both and the instance serves HTTPS on `ngdpbase.server.port`. Leave both empty — the shipped default — and it serves plain HTTP with no complaint, which is the ordinary case for a LAN instance or one behind a proxy.

__Both are read at boot__, so a change to either needs a restart. That is [D6](../security-posture.md#d6-restart-requirements-are-per-item-and-the-ui-must-say-so): restart behaviour is per ingredient and the admin section says so per ingredient, because an operator who changes a value and sees the dashboard report it has been told something untrue until they restart.

### A broken TLS configuration never becomes HTTP

This is the rule the whole design turns on. If TLS is configured and unusable, the instance __does not fall back to plain HTTP__. That would be a transport downgrade: the operator configured TLS, believes traffic is encrypted, and it is in the clear.

Instead it takes the survivable-failure path from [#1152](https://github.com/jwilleke/ngdpbase/issues/1152) — boots into __maintenance mode__, names the file that is wrong, and keeps `/admin` and `/login` reachable so it can be repaired without filesystem access.

That path is [D9](../security-posture.md#d9-a-fatal-configuration-entry-boots-into-maintenance-mode-not-a-dead-process) through [D12](../security-posture.md#d12-configuration-blocked-is-engineready-false): [D10](../security-posture.md#d10-startup-failures-are-gated-into-survivable-and-fatal)'s test is *can an administrator repair this through the admin UI?* — a bad certificate path can, so it is survivable rather than fatal, and [D12](../security-posture.md#d12-configuration-blocked-is-engineready-false) makes the instance report not-ready while it serves the repair screens.

The cases that block a boot, each checked at startup rather than at the first connection:

| Condition | What you see |
|---|---|
| Only one of cert / key is set | *"…is set but…is not — TLS cannot start with only a key"* |
| A file cannot be read | the path and the OS error |
| Malformed PEM, or the key does not match the certificate | the OpenSSL error, plus both paths |

The last one is worth knowing: a mismatched key and certificate throw __synchronously__ when the secure context is built (`ERR_OSSL_PEM_NO_START_LINE` on Node 24), which is what makes them catchable at boot instead of surfacing as a failed handshake later.

Verify a pair before configuring it — these two must print the same hash:

```bash
openssl x509 -noout -pubkey -in cert.crt | openssl md5
openssl pkey  -pubout    -in private.key | openssl md5
```

### An expired certificate is the deliberate exception

An expired certificate __keeps serving HTTPS__ and is reported at error level:

```text
🚨 The configured TLS certificate EXPIRED on <date>. Browsers will refuse to
connect. Serving HTTPS anyway rather than downgrading to plain HTTP.
```

It is checked explicitly because Node does not validate `notAfter` when building a server context — the client rejects the certificate, not the server. Falling back to HTTP over a merely stale certificate would downgrade the transport, and blocking the boot would take down an instance whose operator may be mid-renewal. A stale certificate is already loudly visible to every visitor.

__Nothing in ngdpbase renews a certificate.__ Renewal is the operator's, and an unattended instance will serve an expired certificate indefinitely while every browser refuses it. This is [D17](../security-posture.md#d17-the-recommendations-ship-as-required-pages-carrying-an-accountability-disclaimer)'s division in miniature — the software reports the expiry date it read; the operator owns the renewal and its consequences.

## Redirecting plain HTTP to HTTPS

Once TLS is on, an `http://` request to that port would get a TLS handshake error — which browsers render as *"This site can't provide a secure connection"*, not as anything a visitor can act on.

__Configuring TLS is the entire enable condition.__ There is no separate key to switch the redirect on. A TLS listener owns the whole port, so the redirect happens on the __same socket__: the first byte of a TLS record is `0x16` (handshake) and an HTTP request begins with an ASCII method letter, so the two are told apart before anything is parsed.

```text
http://host:3000/view/Main  →  308  →  https://host:3000/view/Main
```

Notes that matter in practice:

- __308, not 301.__ A 301 *permits* a client to turn a POST into a GET and drop the body, and historically many did. ngdpbase exposes POST APIs — agent page ingest, the Dawarich-compatible endpoints — whose clients are scripts and devices rather than browsers, so a silently bodyless request would be far worse than a redirect. 308 forbids the method change.
- __The path and query survive.__ A deep link redirects to the same deep link.
- __The `Location` host is validated, never echoed.__ `Host` is written by the client, so reflecting it unchecked would make the instance an open redirect. Anything that is not a bare hostname with an optional port is answered with `400` rather than rewritten.
- __The configured base URL decides identity; the request decides the port.__ Taking `ngdpbase.application.base-url`'s host wholesale looks safer and breaks the common deployment: an instance listening on `3000` whose base URL is `https://host` with no port would redirect to `443`, which on a direct-port deployment is not open at all. So when the request's hostname matches the configured one, the request's own host — port included — is used; when they disagree, the configured host wins.

The last rule has a visible consequence: with `base-url` set to a public name, a request to `http://localhost:3000` redirects to __the canonical host__, not to `https://localhost:3000`. Anything on the box that pokes `http://localhost` then depends on that name resolving. `https://localhost:<port>` still works directly, with a certificate-name warning unless the certificate covers `localhost`.

__This is only safe because the instance terminates TLS.__ Behind a proxy the scheme is whatever `X-Forwarded-Proto` claims; if `trust proxy` is wrong the proxy forwards http, the app redirects to https, the proxy forwards http again — an infinite redirect that takes the site down, `/admin` included. Here the bytes on the wire say what the connection is and nothing is inferred.

## The session cookie, and why it is entangled with all of this

`ngdpbase.session.secure` and `ngdpbase.server.trust-proxy` are both posture ingredients in the __Session and cookie__ group ([D15](../security-posture.md#d15-the-ingredients-of-the-shipped-posture)), deliberately shown together because `resolveSessionSecurity()` reads them together and a list showing one without the other would hide half of a known interaction. The TLS keys are ingredients too, in a __Transport__ group added when configuring TLS revealed that the posture was not watching the files the instance had just started serving from.

`ngdpbase.session.secure` tells the browser to send the session cookie only over HTTPS. Turn it on without HTTPS actually reaching the browser and the cookie never comes back: every state-changing POST fails as *"Forbidden — invalid CSRF token"* and login becomes impossible. That is [#1046](https://github.com/jwilleke/ngdpbase/issues/1046), and it is the reason the flag ships `false`.

What makes it safe depends on the shape:

- __Native TLS__ — Express sees the real TLS socket, so `req.secure` is true from the connection itself. Set `secure` on and leave `trust-proxy` alone.
- __Behind a proxy__ — Express sees plain HTTP, so it only knows the request was secure if it is told to read `X-Forwarded-Proto`. `secure` requires `trust-proxy` here.

### `trust-proxy` under native TLS

`ngdpbase.server.trust-proxy` should be __unset__ when this instance terminates TLS. There is no proxy whose headers to read, and trusting forwarded headers that nothing sets lets a caller assert their own address and scheme — which the login throttle counts by and the audit log records.

The resolution ([#1160](https://github.com/jwilleke/ngdpbase/issues/1160)) reflects that:

- An explicit value is always honoured, whatever it is.
- Otherwise it is __derived__ from `session.secure` only when TLS is *not* native — the derivation exists for terminated-upstream deployments, where `secure` without `trust proxy` cannot issue a cookie at all.
- The "secure is on while trust-proxy is explicitly false" warning is suppressed under native TLS, because there that combination is __correct__. Warning about it would train an operator to ignore a warning that is load-bearing when TLS really is terminated upstream.

Removing an explicit `trust-proxy` from a natively-TLS instance therefore results in `trust proxy` being off, no derivation, and no warning — and the boot log simply omits the `🔒 trust proxy enabled` line.

## Verifying a deployment

Run these against the real hostname, not `localhost` — a certificate is issued for a name, and `localhost` will not match a public one.

```bash
# Trust-validated, with NO -k. ssl_verify_result must be 0.
curl -s -o /dev/null -w "%{http_code} verify=%{ssl_verify_result}\n" https://host:3000/

# Plain HTTP on the same port is redirected, path preserved.
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://host:3000/view/Main

# A POST keeps its method through the redirect.
curl -sL -X POST -o /dev/null -w "method=%{method}\n" http://host:3000/api/page/ingest

# The session cookie carries Secure.
curl -s -i https://host:3000/ | grep -i '^set-cookie'
```

__Testing with `-k` proves almost nothing.__ It skips the check that the certificate is valid for that name and trusted, which is the half most likely to be wrong. The refusal is the evidence: a name the certificate does not cover __should__ fail, and if it does not, verification is not happening.

The one check worth more than any of the above is a login round-trip, because a `Secure` cookie the browser will not return is invisible to every test that only fetches pages:

```bash
J=$(mktemp)
TOKEN=$(curl -s -c "$J" https://host:3000/login \
  | grep -oE 'name="_csrf"[^>]*value="[^"]+"' | grep -oE 'value="[^"]+"' | cut -d'"' -f2 | head -1)
curl -s -b "$J" -c "$J" -o /dev/null -w "%{http_code}\n" \
  -X POST https://host:3000/login -d "_csrf=$TOKEN&username=x&password=y"
# 302 = the cookie round-tripped.  403 = CSRF broken, which is #1046.
```

## Things ngdpbase does not do

- __It does not obtain or renew certificates.__ No ACME client, no reload on file change. A renewed certificate needs a restart.
- __It does not bind privileged ports for you.__ Ports below 1024 need root on Linux and macOS; an instance run as an ordinary user stays on its configured port, and the base URL has to carry that port.
- __It does not send HSTS.__ Deliberately not bundled with the redirect: a redirect is reversible, and `Strict-Transport-Security` is not — once a browser caches it, plain HTTP to that host is refused for the full `max-age` regardless of what the server later sends, so a lapsed certificate locks users out rather than degrading.
- __It does not listen on IPv6 unless told to.__ `ngdpbase.server.host` ships `localhost`; `0.0.0.0` binds __IPv4 only__. Dual-stack requires `::`. An instance with an `AAAA` record but an IPv4-only bind is reachable only because clients fall back after the IPv6 attempt fails, which reads as intermittent slowness rather than as a clean error.
- __It does not verify that anything in front of it is configured correctly.__ See [D13](../security-posture.md#d13-deployment-methodology-does-not-influence-the-design).
- __It does not score your TLS setup.__ No grade, no percentage, no badge for a weak cipher or a short key. [D20](../security-posture.md#d20-the-instance-never-scores-itself-against-a-recommended-posture) refuses self-scoring generally: there is no authoritative value set this project can defend inventing, and a number rendered as a deviation would be the software asserting a judgement it cannot support. Use an external scanner, which is what an assessor will do anyway.

## A worked example

`jimstest`, serving on port 3000 with a wildcard certificate it already had:

```json
"ngdpbase.application.base-url": "https://jminim4.nerdsbythehour.com:3000",
"ngdpbase.session.secure": true,
"ngdpbase.server.tls.cert-file": "/Users/jim/certs/nerdsbythehour.com.crt",
"ngdpbase.server.tls.key-file": "/Users/jim/certs/nerdsbythehour.com.key"
```

with `ngdpbase.server.trust-proxy` deliberately __absent__.

Two details from doing it for real. The base URL had to carry `:3000`, because ports 80 and 443 are closed on that host and the instance is reached on its own port — a base URL without the port would have redirected visitors to a closed 443. And the base URL was previously pointing at a hostname that no longer resolved to anything, which had silently broken every absolute URL the instance emitted: magic-link emails, schema.org `@id`s, templates. Nothing failed loudly, because nothing reads those back.
