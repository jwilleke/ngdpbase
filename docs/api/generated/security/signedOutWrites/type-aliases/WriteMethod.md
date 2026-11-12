[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/signedOutWrites](../README.md) / WriteMethod

# Type Alias: WriteMethod

> __WriteMethod__ = `"POST"` \| `"PUT"` \| `"PATCH"` \| `"DELETE"`

Defined in: src/security/signedOutWrites.ts:30

The signed-out write list (#2298): the one place that names which routes may
be written to by someone who is not signed in.

Every request from a caller who is not signed in, other than GET, HEAD and
OPTIONS, is refused by `signedOutWriteGate` (src/middleware/signedOutWriteGate.ts),
before any route runs, unless the route is on this list. A new write route
is therefore closed to signed-out callers until someone adds it here with a
reason, which is the point (#2294 came from routes that were open until
their author remembered to close them).

What belongs here: a route a person reaches BEFORE they are signed in (the
steps of signing in, registering, recovering a password, accepting an
invitation), a link followed from an email in any browser, and a public form.
What does not: anything that asks for a permission a signed-out caller
never holds. A route that answers its own token (a Bearer token, which the
gate counts as signed in) needs no entry.

Core's routes are listed below. An add-on lists its own through the add-on
host, `host.allowSignedOutWrite(...)`, which accepts only a route under the
add-on's own `/api/<slug>/` or `/addons/<slug>/`, and refuses a slug that
names one of core's own `/api/` or `/addons/` prefixes. Those are the only
ways onto the list, and it is sealed once the add-ons have loaded; outside
tests (`NODE_ENV=test`) the seal cannot be undone.

Permission to write is still asked by each route, as always: an entry only
lets the request reach the route, it grants nothing.
