[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/ssrf](../README.md) / ReconciledPolicy

# Interface: ReconciledPolicy

Defined in: src/http/ssrf.ts:292

Reconcile the two configured lists at BOOT, so a contradiction is a startup
message rather than one dropped image months later — which would surface as
a `fetch` warning indistinguishable from the remote host being down.

An overlap between the lists is the normal case and not a conflict: the
allow-list exists to narrow the deny-list. Only these are contradictions.

## Properties

### conflicts

> __conflicts__: `string`[]

Defined in: src/http/ssrf.ts:294

Every contradiction, human-readable.

***

### duplicates

> __duplicates__: `string`[]

Defined in: src/http/ssrf.ts:298

Ranges present verbatim in both lists. A prefix-length tie; the deny wins.

***

### malformed

> __malformed__: `string`[]

Defined in: src/http/ssrf.ts:296

Ranges that do not parse as CIDR. No safe silent resolution — see #1152.
