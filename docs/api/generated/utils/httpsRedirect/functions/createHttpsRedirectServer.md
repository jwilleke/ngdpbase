[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/httpsRedirect](../README.md) / createHttpsRedirectServer

# Function: createHttpsRedirectServer()

> __createHttpsRedirectServer__(`deps`): `Server`

Defined in: src/utils/httpsRedirect.ts:164

An HTTP server that answers every request with a redirect to HTTPS.

A real `http.Server` rather than a hand-written response, so Node parses the
request line and headers. Hand-parsing the first bytes would mean
reimplementing request framing to save one object, and getting it subtly
wrong on the exact path where a visitor is already confused.

__308, not 301.__ Permanent either way — the instance serves TLS on this port
and will keep doing so, so browsers and caches can stop asking. The
difference is the method: 301 *permits* a client to turn a POST into a GET,
and historically most did, which silently drops the request body. 308
forbids it.

That is not academic here. This instance exposes POST APIs — agent page
ingest and the Dawarich-compatible endpoints — whose clients are scripts and
devices rather than browsers. Under 301 an unattended POST to `http://` could
arrive as a bodyless GET and be logged as a bad request, which is a far worse
failure than a redirect that simply works.

## Parameters

### deps

[`RedirectServerDeps`](../interfaces/RedirectServerDeps.md)

## Returns

`Server`
