# Account Import

For operators: bringing users from another system onto a site, keeping their usernames, without carrying any password or passkey over. Each imported user can then be sent an invitation to set up their own sign-in. Built in [#2075](https://github.com/jwilleke/ngdpbase/issues/2075); the invitation is [#2049](https://github.com/jwilleke/ngdpbase/issues/2049).

## What it does

- Reads a list of accounts from a JSON or CSV file.
- Checks every row first and reports, row by row, what would be created, what would be skipped and what is refused, and why.
- With `--apply`, creates each account the way the admin screen does: the username as given, an identity record for the user, the roles below, no password and no passkey. A user with no password cannot sign in until they use an invitation or an administrator sets one.
- Never changes an account that already exists: a username that is already on the site is skipped and reported. Running the same file again creates nothing twice.
- With `--invite`, emails each newly created user the invitation link. The report says who was not invited and why.

Every account created is recorded in the audit log as `user-create`, by the system, with a reason naming the file and the operator who ran it. One `user-import` entry sums up the run: the file, the operator, and how many accounts were created, skipped, refused, failed and invited. A dry run records nothing.

## Before you start

- __Stop the site.__ The import starts the site's engine on the site's data itself. A running site keeps the user list in memory and would overwrite the new accounts, so the import refuses to run while the site's server is running from the same directory.
- Run it from the site's directory, with the same environment the server uses (`FAST_STORAGE`, `SLOW_STORAGE`, the instance `.env`), exactly as for `scripts/reset-admin-password.ts`.
- On a container deployment, scale the site down and run the import in a one-off container that mounts the same data volume, then scale the site up again.
- For `--invite`: email must be set up and working, and the site's own address (`ngdpbase.application.base-url`) must be set, because the link in the email points there. Without them the import still creates the accounts and says that no invitation was sent.

## The file

One account per row: `username` and `email` are required; `displayName`, `roles`, `isTest` and `createdAt` are optional.

JSON, a list:

```json
[
  { "username": "alice", "email": "alice@example.com", "displayName": "Alice Smith", "roles": ["editor"], "createdAt": "2021-03-04T10:00:00Z" },
  { "username": "bob", "email": "bob@example.com", "isTest": true }
]
```

CSV, with a header row naming the columns. Several roles go in one cell, separated by `;` or `|`. `isTest` is `true`/`false` (or `yes`/`no`, `1`/`0`). An empty cell is the same as leaving the field out.

```text
username,email,displayName,roles,isTest,createdAt
alice,alice@example.com,"Smith, Alice",editor,,2021-03-04T10:00:00Z
bob,bob@example.com,,,true,
```

`createdAt` keeps when the account was first made on the old system; it must be a date in the past. Without it the account's creation date is the day of the import.

## Roles

- A role in the file is given only when this site has a role of that name. Any other is left out, and the report notes it (an old system's `user` role, for example).
- A row whose roles are all left out, or that names none, gets the import's default roles: `ngdpbase.user.import.default-roles`, shipped as `reader`.
- The `admin` role is given only when you add `--allow-admin`. Without it, a row asking for `admin` is refused, so you decide on each administrator yourself: re-run with the flag, or change the row.
- Every account also gets the roles every account holds (`ngdpbase.user.account-roles`), as for any new account.

## Which rows are refused

A row is refused, and nothing is made for it, when:

- it has no username, or the username starts or ends with a space;
- the username is a reserved name (`anonymous`, `asserted`, a name starting with `person:`) or the site's system user;
- it has no email address, or one that cannot be an address;
- the same username or email address is already on an earlier row of the file (compared ignoring upper and lower case);
- the email address already belongs to another account on the site;
- the display name is already the title of a page on the site;
- a field has the wrong form: roles that are not a list of names, `isTest` that is not true or false, a `createdAt` that is not a past date;
- it asks for the `admin` role without `--allow-admin`.

## Running it

Dry run first (nothing changes):

```bash
npm run accounts:import -- /path/to/accounts.csv --operator jim
```

Then create the accounts and send the invitations:

```bash
npm run accounts:import -- /path/to/accounts.csv --apply --invite --operator jim
```

On an install built with `npm run build` (a container image), use `node dist/scripts/import-accounts.js` in place of `npm run accounts:import --`.

Options:

| Option | Effect |
| --- | --- |
| `--apply` | Create the accounts. Without it nothing is changed. |
| `--invite` | Email each newly created user their invitation. With a dry run, it reports whether invitations could be sent. |
| `--allow-admin` | Let a row carry the `admin` role. |
| `--operator <name>` | Who is running the import, for the audit log. Defaults to your login name. |

The report lists every row with what happened to it, then the totals. The command ends with an error status when any row was refused or failed, so a script can tell. Start the site again afterwards.

## Settings

| Key | Shipped | What it does |
| --- | --- | --- |
| `ngdpbase.user.import.default-roles` | `{ "reader": true }` | The roles a row gets when it names none this site has |
| `ngdpbase.user.import.batch-size` | `25` | How many rows the import takes before pausing briefly, so a large file does not hold everything else up |
| `ngdpbase.user.import.invite-interval-ms` | `1000` | The pause between two invitation emails, so a large import does not flood the mail server or trip its rate limits |

## See also

- [Self-Registration](Self-Registration.md)
- [email-setup](email-setup.md)
- [UserManager](../managers/UserManager.md) — `importAccounts`
- [authentication-developer-guide.md](../guides/authentication-developer-guide.md) — invitations
