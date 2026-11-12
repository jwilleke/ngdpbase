[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/userAgent](../README.md) / USER\_AGENT\_KEY

# Variable: USER\_AGENT\_KEY

> `const` __USER\_AGENT\_KEY__: `"ngdpbase.http.user-agent"` = `'ngdpbase.http.user-agent'`

Defined in: src/http/userAgent.ts:24

The default `User-Agent` of outbound requests (#1947).

Node's `http.request` adds no User-Agent, so before this every request from
`guardedFetch` went out without one, and APIs that require one refused it
(api.weather.gov answers 403). A caller that names its own User-Agent keeps
it; every other request gets the one built here.

The value is configuration, `ngdpbase.http.user-agent`, a template read on
every request so an operator's change applies without a restart:

- `{version}` is `ngdpbase.version`;
- `{base-url}` is `ngdpbase.application.base-url`, only when it was set
  explicitly. When it was not, the localhost default would be a wrong
  contact, so a parenthesised part holding `{base-url}` is left out,
  brackets and all (`ngdpbase/5.23.0 (+{base-url})` → `ngdpbase/5.23.0`);
- an empty template sends no default User-Agent.

`guardedFetch` has no engine to read configuration from, so the engine hands
it the source at boot (`setUserAgentSource`), the way the log-redaction table
is filled. Until then, and in tests that set none, no default is added.
