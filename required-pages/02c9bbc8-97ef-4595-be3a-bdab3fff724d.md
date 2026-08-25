---
title: Using Tokens
uuid: 02c9bbc8-97ef-4595-be3a-bdab3fff724d
system-category: documentation
user-keywords:
  - tokens
  - api
  - agents
  - automation
slug: using-tokens
lastModified: '2026-08-25T00:00:00.000Z'
author: system
---

# Using Tokens

An __agent token__ lets a program act on [{$applicationname}] as you, without knowing your password. Use one when a script, an AI assistant, or another system needs to read or write pages on your behalf.

A token is a __delegation of your own authority__. It can never do anything you could not already do yourself, and everything it does is recorded against both your account and the token's name.

## Why not just give the program your password

A password is all-or-nothing and permanent. A token is not:

- __Limited__ — you choose what it may do. A token for creating pages cannot delete them.
- __Short-lived__ — it expires within a day. A leaked token stops working on its own.
- __Revocable__ — you can switch one off immediately without changing your password.
- __Traceable__ — every page it creates or edits is attributed to that token by name, so you can tell later which program made a change.

Handing over a password gives up all four.

## Before you start

Tokens are __off by default__. If you do not see the Agent API Tokens section described below, an administrator needs to enable them first — see [Server Management].

## Creating a token

1. Sign in and open your [Profile Page].
2. Find the __Agent API Tokens__ section and choose __New__.
3. Fill in three things:

| Field | What to put |
|---|---|
| __Name__ | What the token is for, such as `import-script` or `research-assistant`. This name appears in the audit trail on every change the token makes, so make it identify the program. |
| __Permissions__ | The least the program needs. See the table below. |
| __Hours__ | How long it should live, from 1 to 24. |

1. Choose __Create__.

### Choosing permissions

| Option | The program can | Choose it when |
|---|---|---|
| Read only | Read pages | The program only gathers information |
| Create and edit pages | Add new pages and change existing ones | The usual choice for importing or generating content |
| Create, edit and rename | Also change page titles | The program reorganises pages |
| Create, edit, rename and delete | Also delete pages | Rarely. Deleted pages remain recoverable from the trash |

Pick the narrowest option that works. You can always create a second token later.

## Copy the token immediately

The token is shown __once__, when you create it. It is not stored anywhere you can read it back — only a scrambled form is kept, so nobody, including an administrator, can recover it afterwards.

Copy it straight into wherever the program keeps its settings. If you lose it, revoke it and create another; there is no way to look it up.

A token looks like `ngdp_at_` followed by a long string of characters.

## Giving the token to a program

The program sends the token with each request, in a header:

```text
Authorization: Bearer ngdp_at_your-token-here
```

Most tools have a field for this — often labelled "Bearer token", "API token", or "Authorization header". Anything that can call a web API can use one.

## Treat it like a password

A token is a working credential for your account, within the limits you set.

- Do not paste it into a page, a chat message, or an email.
- Do not commit it to a code repository.
- Keep it in the program's own configuration or secret storage.
- If you think it has been seen by anyone else, revoke it. That takes effect immediately.

## Seeing and revoking your tokens

Your [Profile Page] lists every token you have, with its name and when it expires. Each has a control to revoke it.

Revoking is immediate — the next request using that token is refused. Nothing else you own is affected, and your password is unchanged.

## When tokens expire

Every token expires within a day at most. This is deliberate: a credential that lives forever is one that leaks quietly and keeps working.

A program that runs continuously therefore needs a new token each day, created here while you are signed in. There is no way for a program to renew its own token — that is the point, since anything able to renew a credential indefinitely is close to a permanent one.

If a program stops working and reports an authorisation failure, an expired token is the first thing to check.

## Limits

- A token lasts at most __24 hours__.
- You may have up to __10 active tokens__ at once. Revoke ones you no longer use.
- A token can never exceed __your own__ permissions. If your access changes, so does what your tokens can do.

## Related

- [Profile Page] — where tokens are created and revoked
- [User Roles and Permissions] — what your account may do, which bounds every token you create
- [Server Management] — enabling tokens, for administrators
