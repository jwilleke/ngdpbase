# Executive Hub

One place, `/executive`, where the Board of Directors or the president sees everything the organization keeps and decides what waits for the board. Epic [#2092](https://github.com/jwilleke/ngdpbase/issues/2092). Terms follow [docs/GLOSSARY.md](../GLOSSARY.md) (Identities).

## Why (operator, 2026-10-26)

Executive work is scattered today: some of it under `/admin`, which is for running the site, and the rest inside each add-on, mostly on the treasurer's pages. The board is legally responsible for everything the organization does, so it needs one place to see all of it.

## The executive role (operator, 2026-10-26)

- A core role, `executive`, made from permissions that already exist.
- It is read-only to everything the organization keeps. Nothing the organization holds is hidden from it: donor names and amounts, every unit's account, folios, liens and write-offs, occupancy forms, owner-change requests, the treasurer's pages and the ledger.
- It includes accounting's CSV downloads (`ledger-export`): a download only reads the books, and the board answers for them (operator, 2026-10-26).
- Its one kind of action: approving or rejecting the requests waiting for the board, through core's reviews ([#2072](https://github.com/jwilleke/ngdpbase/issues/2072), `/reviews`). Nothing else, for now.
- Who holds it is a site role for now. Governance (board, officers, members) is a deferred add-on (ngdpbase-addons#24).

## The boundary (operator, 2026-10-26)

A user's own personal records are not the organization's and stay private from the executive role:

- health records (the phr add-on);
- a user's own vaults, pages and files;
- sign-in credentials (passwords, passkeys, recovery words).

## What stays where it is

- Treasurer work stays the treasurer's: receipts, deposits, invoice runs, write-offs, liens, and unlocking a period.
- Running the site stays on `/admin`.

## The hub page

- A core page at `/executive`, open only to the executive role.
- Add-ons contribute cards, the way they register `/admin` cards today.
- One combined list of pending decisions, read from core's reviews.
- Card candidates, all from figures the add-ons already have:
  - accounting: fund balances, cash not yet deposited, receivables outstanding, units owing, liens, write-offs, donation totals (with names, for the executive), and pending items (invoices not issued, deposits not cleared, bounced checks);
  - accommodation: owner-change requests waiting, units with no current owner, units with no usable billing address, recent changes owners made;
  - association: occupancy forms waiting.

## The Executive shared folder (operator, 2026-10-26; built as the first org shared folder, 2026-10-28)

- Owned by the organization, not by a person, so access follows the role when the board changes.
- Everyone holding the executive role can read it.
- Adding and editing need a separate permission, given to a secretary role or to whoever the site chooses. Every change is recorded in the audit log.
- It holds board papers: minutes, the Declaration and Bylaws, filed financial summaries and CSVs, accountant letters, and board-only unit files. Live figures stay in the add-ons; the shared folder holds filed copies.
- It is `/shared/executive`, the first org shared folder ([#1775](https://github.com/jwilleke/ngdpbase/issues/1775)), and is called a shared folder, never a vault (operator, 2026-10-28). Today a vault opens only to its owner and the people they delegate to, never to a role; shared folders are the new kind that opens by role. How shared folders are keyed, searched, created and ended is decided in [shared-folders.md](shared-folders.md) (2026-10-28).

## Steps (each its own issue)

- 1 The executive role and the `/executive` page: add-on cards and the pending-decisions list ([#2093](https://github.com/jwilleke/ngdpbase/issues/2093)). Built: the page asks `executive-read`, a new permission the role alone holds; the role's policy grants `page-read`, `asset-read`, `media-read`, `search-page`, `page-export`, `identity-read`, `user-read`, `search-user` and `executive-read` (operator, 2026-10-28). Cards use `registerDashboardCard` with `surface: 'executive'` ([add-ons guide](../guides/addons-developer-guide.md#register-an-executive-hub-card)).
- 2 Add-ons grant their read and board-decide permissions to `executive` in their own policies, and contribute their cards ([#2094](https://github.com/jwilleke/ngdpbase/issues/2094)).
- 3 The Executive shared folder, `/shared/executive` ([#2095](https://github.com/jwilleke/ngdpbase/issues/2095)).

## Still open

- Whether the board must approve a write-off, a lien or unlocking a period before the treasurer records it. Today the treasurer does these alone, with an audit record; "not for now" (operator, 2026-10-26).
