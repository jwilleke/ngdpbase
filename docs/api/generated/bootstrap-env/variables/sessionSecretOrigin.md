[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [bootstrap-env](../README.md) / sessionSecretOrigin

# Variable: sessionSecretOrigin

> __sessionSecretOrigin__: [`SessionSecretOrigin`](../../utils/sessionSecret/type-aliases/SessionSecretOrigin.md)

Defined in: src/bootstrap-env.ts:132

# 1194: `NGDPBASE_SESSION_SECRET` MUST be defined in `.env`. If none of the
three sources above supplied it, generate one and backfill the per-instance
file, so the rule is true from the second boot on and the first boot never
runs on the literal shipped in app-default-config.json.

This is the one place ngdpbase writes a `.env`. The `env-keys` comment in
app-default-config.json records the exception. A placeholder value, or a
file that cannot be appended to, refuses boot here — before the logger
exists, so the message goes to stderr.
