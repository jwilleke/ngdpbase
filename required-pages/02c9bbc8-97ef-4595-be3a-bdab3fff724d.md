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
lastModified: '2026-10-14T00:00:00.000Z'
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

Tokens are __off by default__. If you do not see the __New token__ button in the __My tokens and devices__ section described below, an administrator needs to enable them first — see [Server Management].

Once they are on, anyone who can sign in may create tokens, except on a demo administrator account. Creating one asks you to confirm your sign-in if you have not signed in recently.

## Creating a token

1. Sign in and open your [Profile Page].
2. Find the __My tokens and devices__ section and choose __New token__.
3. Fill in three things:

| Field | What to put |
|---|---|
| __Name__ | What the token is for, such as `import-script` or `research-assistant`. This name appears in the audit trail on every change the token makes, so make it identify the program. |
| __Permissions__ | The least the program needs. See the table below. |
| __Hours__ | How long it should live, from 1 to 24. |

1. Choose __Create__. Copy the token, then choose __Done__; it then appears in your list.

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

The __My tokens and devices__ section of your [Profile Page] lists everything you have let act for you, in one place:

- __Agent tokens__ you made, with what each may do, when it ends, and when it was last used.
- __Apps and devices__ you approved to sign in with your account, such as a phone app or a device you connected by entering a code.

Each row says which kind it is:

| Kind | What it means |
|---|---|
| __Fixed__ | It stops working on its end date. When you need it again, you make or approve a new one. |
| __Extendable__ | An agent token that stops on its end date unless you press __Extend__, which moves the date later. Shown instead of Fixed on your own tokens when you are allowed to extend tokens. |
| __Refreshable__ | It renews itself automatically, with a new key each time, so a device can keep working unattended. The list shows when it was last renewed, and when it ends if it has an end date. |

The __Can do__ column says in plain words what each one may do. Point at a line to see the permission's short name. Every permission and what it lets you do is listed on [Permissions]. A line the site does not recognise, such as one an app asked for on its own, is shown exactly as the app named it.

Each row has __Revoke__. Revoking is immediate — the next request using that token, app or device is refused. A revoked app or device has to be approved again before it can sign in. Nothing else you own is affected, and your password is unchanged. You may be asked to confirm your sign-in first.

### Tokens and devices someone set up for you

If you let someone act for you (see [Acting For Someone Else]), they may be able to make a token or connect a device for you. It is yours and appears in your list, marked __Approved by__ and their name, followed by "(acting for you)". It can do only what you, they and the access you gave them all allow.

It keeps working only while their access to your account lasts. When you revoke their access, or it reaches its end date, every token and device they set up for you stops at once. You can also revoke one on its own, like any other row.

## When tokens expire

Every token expires within a day at most. This is deliberate: a credential that lives forever is one that leaks quietly and keeps working.

A program that runs continuously therefore needs a new token each day, created here while you are signed in. There is no way for a program to renew its own token — that is the point, since anything able to renew a credential indefinitely is close to a permanent one.

## Extending a token

If you are allowed to extend tokens, your agent tokens show as __Extendable__ in __My tokens and devices__ on your [Profile Page], each with an __Extend__ button beside __Revoke__. __Extend__ moves a token's expiry to a full day from now. The token itself and what it may do stay the same, so the program using it keeps working without being given a new one.

- Only a token that has not expired and has not been revoked can be extended. Once a token has expired, create a new one.
- Extending never makes a token last longer than a day from the moment you extend it.
- You can extend only your own tokens. Like creating one, extending asks you to confirm your sign-in if you have not signed in recently.
- Extending is an administrator's permission by default; an administrator can let others do it too.

If a program stops working and reports an authorisation failure, an expired token is the first thing to check.

## Limits

- A token lasts at most __24 hours__.
- You may have up to __10 active tokens__ at once. Revoke ones you no longer use.
- A token can never exceed __your own__ permissions. If your access changes, so does what your tokens can do.

## Related

- [Profile Page] — where tokens are created, extended and revoked
- [User Roles and Permissions] — what your account may do, which bounds every token you create
- [Server Management] — enabling tokens, for administrators
