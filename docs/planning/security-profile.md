# Security profile — deployment posture as a preset

`ngdpbase.security.profile` names __where an instance sits and what data is on it__, and selects
defaults for keys that stay individually settable. It is not a security switch, and it never gates a
mechanism.

This design started inside [Security-auditing.md](./Security-auditing.md) because auditing was its
first consumer. It is here now because it stopped being an audit concern: network egress adopted it
in [#1133](https://github.com/jwilleke/ngdpbase/issues/1133), and session policy, registration and
rate limiting are the same shape. Tracked by [#1137](https://github.com/jwilleke/ngdpbase/issues/1137).

## The problem it solves

The keys underneath a profile are the real controls, and an integrator can set every one of them.
That is a complete answer for an integrator and a non-answer for the person this software is mostly
run by. Somebody with a server on their home LAN should not have to know that a failure policy, an
egress CIDR list and a session-cookie flag are the three things their situation implies.

They know one thing reliably: __where the instance sits and what is on it.__ That is what the
profile asks.

## The three levels

| Profile | Deployment shape | Exposure | Regulatory |
|---|---|---|---|
| `baseline` | home or personal instance, private IPs, LAN-only | low | none |
| `hardened` | reachable from the internet | high | none |
| `regulated` | carries data under a compliance regime | high | yes |

These bundle coherently because each is a real context rather than a point on an abstract scale.

__Numbered levels were considered and rejected.__ `level.two` does not tell an operator whether it
is theirs; `hardened` does. The names follow the Kubernetes Pod Security Standards convention, and
deliberately avoid `strict` and `secure` — both imply the alternative is insecure, which is what
makes an operator pick the wrong one for the wrong reason.

`regulated` is not hypothetical. It is the posture an instance would need in order to host YourPHR
([yourphr#697](https://github.com/jwilleke/yourphr/issues/697)), which is what surfaced
[#1133](https://github.com/jwilleke/ngdpbase/issues/1133) and
[#1134](https://github.com/jwilleke/ngdpbase/issues/1134) in the first place.

## The rules

1. __A profile is a preset, never a gate.__ It sets defaults for keys that remain individually
   settable, so *"baseline, but refuse-to-boot"* is expressible and an explicit key always wins.
2. __No profile disables a mechanism.__ *"A flag that gates a mechanism creates two code paths, and
   the weak one is what everybody runs."* A profile changes failure policy and volume, never whether
   a control exists. The egress guard is installed on every profile; the profile only picks which
   address ranges are policy rather than mechanism.
3. __The instance publishes its effective posture, not its profile name.__ A home instance says *"I
   guarantee tamper evidence and completeness; I do not guarantee critical durability or read
   auditing"* — a true and useful statement rather than a lesser one. This is the rule that makes
   levels honest.
4. __Warn when the declared profile and the actual keys disagree__, rather than silently letting one
   win. `AuditManager.ts:376` does this today and it should generalise.
5. __A profile may never default a key whose mechanism does not exist.__ See the taxonomy below —
   this is the rule that keeps a profile from writing cheques the code cannot cash.

## What a profile may govern — four classes

The controls a compliance regime asks for are not all the same kind of thing, and only one class can
be defaulted by a profile at all. Conflating them is how a profile ends up declaring a control that
nothing implements.

| Class | Enforced by | A profile may | Example |
|---|---|---|---|
| Config key with a working mechanism | the key, read by live code | __default it__ | log retention |
| Provider capability | a provider existing and being registered | __not require it until it exists__ | MFA |
| Report | describing reality back to the operator | __never set it__ — it reports, it does not decide | evidence |
| Data-model invariant | code shape, verified by a static check | __not express it at all__ | prohibitions |

__Provider capability is the trap.__ There is no MFA in this codebase — no TOTP, WebAuthn or passkey
provider, and both issues are open and deferred
([#421](https://github.com/jwilleke/ngdpbase/issues/421),
[#448](https://github.com/jwilleke/ngdpbase/issues/448)). If `regulated` defaulted `mfa.scope = all`
today the result is precisely the [#1118](https://github.com/jwilleke/ngdpbase/issues/1118) bug
class: a declared control, nothing implementing it, and the instance reporting healthy. MFA is a
__blocker__, not an axis.

__Prohibitions cannot be configured.__ "An authentication secret must not be stored" is not a
setting — either a code path writes an agent token to the audit log or none does. Its enforcement
family is [#1134](https://github.com/jwilleke/ngdpbase/issues/1134)'s store-boundary lint: an
invariant that needs a static check. The audit path currently captures structured event fields only,
so `ngdp_at_` tokens have no route into the log — but that safety is __unstated__, and nothing would
go red if someone added a header-carrying field.

## The matrix

Only keys with a live consumer appear as defaults. Everything else is listed as proposed, per rule 5.

### Live — the key exists and code reads it

| Key | `baseline` | `hardened` | `regulated` | Consumer |
|---|---|---|---|---|
| `ngdpbase.audit.on-failure` | `continue` | `refuse-boot` | `refuse-boot` | `AuditManager` |
| `ngdpbase.audit.retentiondays` | `90` | `365` | `2190` (6 years) | `FileAuditProvider` |
| `ngdpbase.audit.read-events` | `false` | `false` | `true` | `AuditManager` |
| `ngdpbase.security.egress.allowed-ranges` | `[]` | `[]` | `[]` | `guardedLookup` |
| `ngdpbase.session.secure` | `false` | `true` | `true` | session middleware |
| `ngdpbase.application.registration` | `true` | `false` | `false` | registration route |

Retention is the clean case: the mechanism is done and only the __value__ is posture-dependent. 90
days is short of PCI DSS's 12 months and far short of HIPAA's 6-year documentation expectation.

`session.secure` defaulting `false` on `baseline` is deliberate — a LAN instance on plain HTTP would
lock itself out of its own sessions otherwise.

### Proposed — needs a mechanism before a profile may default it

| Key | Blocked on |
|---|---|
| `ngdpbase.audit.critical-durability` | no consumer; the tiered-durability work |
| `mfa.scope` | [#421](https://github.com/jwilleke/ngdpbase/issues/421) / [#448](https://github.com/jwilleke/ngdpbase/issues/448) — no provider exists |
| off-box audit head | [#1138](https://github.com/jwilleke/ngdpbase/issues/1138) — `offBox` is hardcoded `false` |

## Regimes are recipes, not profiles

Whether to add `hipaa` and `pci` profiles was considered and rejected, for three reasons.

__The name is a claim the software cannot back.__ `profile: "hipaa"` reads as "this instance is HIPAA
compliant". It is not, and no configuration can make it so — BAAs, risk analysis, workforce training
and breach-notification procedures are organizational, and they are most of the regime. Rule 3 exists
to stop the software asserting what it cannot demonstrate; a regime-named profile breaks that rule by
its name, before a single key is set.

__They do not compose.__ An instance under both regimes has no valid selection, and the correct
configuration is their union. Add SOC 2 or GDPR and each is another profile that still cannot express
an overlap. That is NIST SP 800-63's LOA failure in a worse form: not merely forced
over-implementation, but no expressible answer at all.

__They become a maintenance liability.__ A profile named for a standard must track that standard's
revisions or it starts lying, and on a single-maintainer repo nobody owns that.

### What to do instead

Separate the axis from the label. The regimes differ on specific, nameable properties — so those are
keys, and a regime is a __documented recipe__ over them:

> To meet HIPAA's technical safeguards, set these keys. Here is what ngdpbase demonstrates, and here
> is what remains your organization's responsibility.

That scales to any number of regimes, expresses overlaps naturally (take the stricter value on each
axis), and never puts a compliance claim in a config value.

The usability argument still stands, so the recipe should be __an action, not just prose__: an admin
UI button that __writes the explicit keys__. The operator sees exactly what changed, can override any
of it, and the resulting configuration states what it does rather than what it claims. One click, no
hidden semantics.

### Does PHI cover PCI?

No. The technical controls overlap heavily — access control, audit completeness, encryption in
transit and at rest, egress restriction — but the regimes diverge where a single preset cannot
reconcile them:

| | PCI DSS | HIPAA |
|---|---|---|
| Log retention | 12 months, 3 immediately available | 6 years documentation |
| MFA | required for all access into the CDE (4.0) | not stated that way |
| Prohibition | sensitive authentication data must not be stored at all | no equivalent |
| Evidence | quarterly ASV scans, annual pen test | risk analysis, policies |

Retention alone is a different value, so one `regulated` level would have to pick a side.

__And the architectural answer matters more than the config one: ngdpbase should never be in PCI
scope.__ It is a content platform, and the correct posture toward cardholder data is descoping. PHI
is different — if the instance hosts a health record, the data is the product and cannot be descoped.
That asymmetry is why PHI drives the level and PCI does not.

`regulated` should therefore be defined as __the technical controls common to these regimes,
necessary but not sufficient for any of them__, and never carry a standard's name.

## Precedent

Named profiles over individually-settable keys is well-trodden: __Kubernetes Pod Security Standards__
(`privileged` / `baseline` / `restricted`), __CIS Benchmarks__ Level 1 and Level 2 — explicitly
divided by functional impact rather than by whether security exists — and __NIST SP 800-53__ LOW /
MODERATE / HIGH control baselines. __SLSA__ contributes the idea rule 3 is built on: each level is
defined by what you can __demonstrate__, and you publish which one you meet.

The cautionary case is __NIST SP 800-63__. Its 2013 edition had a single Level of Assurance, LOA 1–4.
The 2017 revision deleted it in favour of three independent axes, because the components do not move
together and one dial forced deployments to over-implement one property to obtain another.

That is why the levels here are __deployment shapes rather than assurance points__, and why the
expressiveness lives in the keys beneath them. A third level is legitimate because `regulated`
describes a context somebody actually runs — not because it is "more secure" than `hardened`.

## Where this stands

- `ngdpbase.security.profile` ships with `baseline` and `hardened`
  ([#1118](https://github.com/jwilleke/ngdpbase/issues/1118))
- Two consumers: `AuditManager` defaults `audit.on-failure`; the egress boundary reads the profile
  for its CIDR policy ([#1133](https://github.com/jwilleke/ngdpbase/issues/1133))
- `regulated` is __not__ implemented
- Effective-posture reporting exists in part — `AuditManager.ts:306` exposes `tamperEvident`,
  `durable`, `queryable`, `offBox`

## Related

- [Security-auditing.md](./Security-auditing.md) — the audit bar and the gaps; profile design lived
  there first
- [#1137](https://github.com/jwilleke/ngdpbase/issues/1137) — the epic this document belongs to
- [#1138](https://github.com/jwilleke/ngdpbase/issues/1138) — off-box audit head; `offBox` cannot be
  true until it lands
