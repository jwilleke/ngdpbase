[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / signupRateLimiter

# Variable: signupRateLimiter

> `const` __signupRateLimiter__: [`SimpleRateLimiter`](../../utils/SimpleRateLimiter/classes/SimpleRateLimiter.md)

Defined in: src/routes/WikiRoutes.ts:766

Per-IP limiter for the two account-signup surfaces (#1026, closes #1020):
`POST /register` and `POST /auth/magic-link`.

Both were previously unlimited from a single source. The magic-link path had
only a 1-per-email-per-60s throttle inside the provider, which a caller
sidesteps entirely by varying the address — and since each request sends
mail, that made an open instance a mail-sending primitive aimed at arbitrary
third parties. With a typical relay free tier around 100 sends/day, one
script also exhausts the quota and links stop arriving for real users.

Deliberately shares the `ngdpbase.mail.rate-limit.*` config the contact form
uses — `app-default-config.json` already names re-enabled `/register` as an
intended consumer of those flags. Exported so tests can call `.reset()`.
