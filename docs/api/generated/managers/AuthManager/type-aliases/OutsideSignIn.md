[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / OutsideSignIn

# Type Alias: OutsideSignIn

> __OutsideSignIn__ = \{ `next`: `string`; `outcome`: `"signed-in"` \| `"created"`; \} \| \{ `error?`: `string`; `outcome`: `"connect-first"`; \} \| \{ `outcome`: `"choose-account"`; \} \| \{ `outcome`: `"refused"`; \} \| \{ `outcome`: `"replayed"`; \} \| \{ `binding`: `string`; `handle`: `string`; `next`: `string`; `outcome`: `"second-step"`; \}

Defined in: src/managers/AuthManager.ts:635

How an outside sign-in's callback ended (#1743), for the route to answer.

## Union Members

### Type Literal

\{ `next`: `string`; `outcome`: `"signed-in"` \| `"created"`; \}

Signed in (`created`: an account was made for it first); `next` is where to go.

***

### Type Literal

\{ `error?`: `string`; `outcome`: `"connect-first"`; \}

Held as a pending connection: the person signs in another way to connect it. `error` is what to say, if anything.

***

### Type Literal

\{ `outcome`: `"choose-account"`; \}

# 2073: several accounts share the verified email; held for the person to choose one (`outsideChoice`).

***

### Type Literal

\{ `outcome`: `"refused"`; \}

Refused; nothing says whether an account exists.

***

### Type Literal

\{ `outcome`: `"replayed"`; \}

The state was already used: no second session.

***

### Type Literal

\{ `binding`: `string`; `handle`: `string`; `next`: `string`; `outcome`: `"second-step"`; \}

# 1532: the provider's sign-in reached only AAL1 and the account has a
second factor: held as a pending sign-in, as after a password. The route
binds the browser (`binding`), keeps `handle` in the session and sends the
person to the second-factor page; `next` is where they were going.
