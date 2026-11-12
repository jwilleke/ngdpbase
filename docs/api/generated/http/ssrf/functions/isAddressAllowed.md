[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/ssrf](../README.md) / isAddressAllowed

# Function: isAddressAllowed()

> __isAddressAllowed__(`address`, `policy`): `boolean`

Defined in: src/http/ssrf.ts:237

The full decision for one address.

Order, and the reasoning behind it:

  1. Unparseable  -> refuse. Fail closed.
  2. Tier 1       -> refuse, whatever the policy says.
  3. Explicit policy, longest prefix wins; a tie goes to deny. Explicit
     entries outrank the built-in defaults at equal length, mirroring the
     profile rule that an explicit key always beats a preset (#1137).
  4. Built-in policy defaults -> refuse.
  5. Otherwise public -> allow.

Longest-prefix is the ROUTING convention, chosen deliberately over the
access-control conventions (iptables, Cisco ACLs and AWS NACLs all resolve
by rule order). It is used here because the values are routes: specificity
is intrinsic to a CIDR and needs no operator-maintained ordering, which in a
JSON config would drift silently.

## Parameters

### address

`string`

### policy

[`EgressPolicy`](../interfaces/EgressPolicy.md)

## Returns

`boolean`
