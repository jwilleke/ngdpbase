# The Fairways — Operator Demo Guide

- Audience: Operator / Admin of a deployed The Fairways site (HOA-style community site)
- Duration: 25–35 minutes
- Server needed: The Fairways instance (the demo URL example below assumes `http://jminim4:2121/`; substitute the production URL)

This guide walks an operator through everything they need to run The Fairways day-to-day: managing members, posting content, controlling who sees what, reviewing contact submissions, and the operational tasks (backups, logs, restarts) that keep the site healthy. It is the operator counterpart to the [technical demo guide](./technical.md) — that one is for developers; this one is for the person who will actually run the site.

---

## Before You Start

1. Site is reachable: `curl -s -o /dev/null -w "%{http_code}\n" http://jminim4:2121//` returns `200` or `302`. If not, ask the host to start it (`./server.sh start` from the install directory).
2. You have an admin account: username + password handed off by the installer. The account must have the `admin` role. If you only have a regular member login, stop and ask for the admin credentials before continuing.
3. Email may or may not be wired up. Look at the bottom of any page footer: if you see a Contact link, mail-bearing features are live. If not, contact-form submissions still get saved to disk but no email goes out — that's expected pre-mail-setup.
4. Open two browser windows side-by-side. Window A: signed in as admin. Window B: signed in as a regular member (or signed out entirely). This is the single most useful demo setup — it lets you show audience-targeted content from both sides at the same time.

%%informationAbout the URLs in this guide: every example URL uses `http://jminim4:2121/`. In a real deployment substitute your actual hostname and port. The path portion (`/admin/...`, `/view/...`) is identical regardless of host.

---

## Act 1 — Orient yourself (3 min)

Goal: Know where you are and what the role of "admin" actually gives you.

### Sign in as admin

Go to `/login`, enter admin credentials, submit. You land back on the home page but the navigation now shows extra admin items.

### What changed visually

| Before login | After admin login |
| --- | --- |
| Public pages only — About-us, Community Amenities (if public), News Updates | All of the above plus Members Only, every member's profile, and any audience-restricted pages |
| No edit / delete buttons | Edit / Info / Delete buttons appear on every page you can act on |
| No admin menu | Admin menu in the header — Users, Roles, Settings, Backups, Logs, etc. |

### Things to point out

- The Fairways is built on ngdpbase — the same platform other community sites use. A lot of what you see is generic platform behavior, not Fairways-specific.
- Every page is a Markdown file on disk. No database. Easy to back up, easy to inspect, easy to recover. We come back to this in Act 7.
- Your role is `admin`. That gives you (a) ability to view every page regardless of audience restriction, (b) ability to edit every page, (c) ability to manage other users + roles, and (d) access to the operational tools (logs, backups, config).

%%information🗣️ *Talk-track: "As admin you have a master key. Most of what you'll do day-to-day is page editing and member management — the same screens regular editors use. The admin-only screens come up when you're setting things up or troubleshooting."*

---

## Act 2 — Manage members (5 min)

Goal: Show how to add a new resident, set their role, and edit their info.

### View the member list

Navigate to Admin → Users, or directly to `/admin/users`.

Each row is one member. Columns include username, display name, email, roles, last login, and active state. The search box at the top filters by name or email.

### Add a new member

- Click Add user (or + New).
- Fill in: username (a short handle — used in URLs), display name (the human name, e.g. "Molly Crotty"), email, initial password, and assign roles.
- Roles cheat-sheet:

   | Role | What they can do |
   | --- | --- |
   | `admin` | Full access. Reserve for site operators only — usually 1–2 people. |
   | `editor` | Edit every page, but can't manage users or change settings. Useful for a board member who'll write the newsletter. |
   | `authenticated` | Default role for any logged-in member. View Members-Only pages, contact the board via the contact form, edit their own profile. |
   | `anonymous` | Anyone not logged in. Can see public pages only. |

- Save. The new member gets their credentials out-of-band (you tell them, or in some setups email is configured to send a welcome).

%%information⚠️ *Common pitfall: don't give residents `admin`. The `editor` role is what you usually want for the newsletter editor / board secretary. Reserve `admin` for the technical contact.*

### Edit an existing member

Click any row → Edit. You can change display name, email, password (force a reset), role assignments, and active state. Setting Active=false deactivates the login without deleting the user — recoverable.

### Member profile pages

Each member who fills in their profile gets a profile page at `/view/<Their-Name>`. When a member visits `/profile`, they edit their own. As admin, you can also edit profile pages directly from Admin → Required Pages or via the page's Edit button.

%%information
🗣️ Talk-track: "Profile pages are author-locked — only the owner (or an admin) can edit them. This is a recent fix; old installs may have a stale profile page floating around as just a regular page. If you see one, the system flags it."

%%

---

## Act 3 — Pages: create, edit, attach (5 min)

Goal: Walk through the page lifecycle, the parts most operators will touch every week.

### Edit an existing page

Navigate to any page (e.g. `/view/News-Updates`) → click Edit in the header.

The editor has:

- Title — what shows up in the heading and the URL slug (auto-derived).
- System category — set this to general for normal content. Other values (`documentation`, `system`, `addon`, `user-profile`) are for special purposes and you won't change them often.
- User keywords — free-form tags. Useful for finding related pages later via the search box.
- Audience — see Act 4.
- Private — see Act 4.
- Content — the body in Markdown + JSPWiki-style markup. The right side panel previews as you type.

Make a small change, save, and you land back on the rendered page.

### Create a new page

Click Create in the top nav (or `/create`).

- Type a title (e.g. `Pool Maintenance Schedule`)
- Pick a template if one fits — Blank gives you a clean slate
- Save → starts on the new page in edit mode

%%information🗣️ Talk-track: "There is no separate 'publish' step. Save means it's live. If you want a draft, set Audience to just yourself + admins (Act 4) and flip it open later."

%%

### Attach a file

While editing, scroll to Attachments or use the toolbar attach button. Upload one or more files. Once uploaded:

- Reference inline with the bracket-link form: `[Lease Agreement|Lease-Agreement-2026.pdf]` renders as a download link to the file
- For images use the same pattern with an image extension, or `[{Image src='floor-plan.png' caption='Clubhouse layout'}]` for finer control

%%information
🗣️ Talk-track: "Files attach to a specific page. They're stored content-addressed under the page's UUID, so the same PDF uploaded to two pages is one file on disk."

%%

### Embed dynamic content

Show off a few plugins by adding them to a scratch page. Have the audience guess what they do before you save:

```
Total pages on this site: [{TotalPagesPlugin}]

Server has been up: [{UptimePlugin}]

Recent changes (last 5):
[{RecentChangesPlugin max=5}]
```

Save → all three render dynamically. The Recent Changes block is one operators come back to a lot.

---

## Act 4 — Control who sees what (3 min)

Goal: Three ways to restrict access, when to use each.

### Three knobs

| Knob | Where | What it does | Use it for |
| --- | --- | --- | --- |
| Private | Page editor → Private toggle | Only the page author + admins can view | A draft, a private note, a sensitive document you're preparing |
| Audience | Page editor → Audience picker | Limit view access to specific roles and/or specific named members | "Board only" pages, "board + treasurer" pages |
| Author lock | Page editor → Author Lock toggle | Only the original author + admins can edit (others can still read if audience allows) | Profile pages, opinion pieces, columns from a specific resident |

### Live demo

In Window A (admin):

- Open `/view/Members-Only` → Edit
- Open the Audience dropdown — check `authenticated`. Verify the username typeahead below the dropdown is empty.
- Save.

In Window B (regular member): refresh `/view/Members-Only` — visible.

In a third window or browser private mode (anonymous): visit `/view/Members-Only` — get a 403 or redirect to login.

Then go back to Window A:

1. Open `/view/Board-Notes` (or any page) → Edit
2. Audience: uncheck all roles, type a specific member's username in the typeahead, pick them from the dropdown. A chip appears below.
3. Save.

That page is now visible to just that one member plus admins. Audience entries can be roles, individual usernames, or a mix — the engine accepts both.

%%information⚠️ Common pitfall: "Audience: empty" is open access, not "nobody". Leave all roles unchecked + no users to make a page world-visible. If you want admins-only, check `admin` and nothing else.

%%

%%information
⚠️ Common pitfall: Private overrides everything else. A page marked Private is invisible to everyone but the author and admins, regardless of audience.

%%

---

## Act 5 — News & contact (5 min)

Goal: Show the two most common public-facing flows.

### Posting a news update

- `/view/News-Updates` → Edit
- Add a new section at the top:

```
  ## New Lifeguard Schedule (2026-06-01)

  Starting June 1st the lifeguards are on duty 10am–8pm weekdays and 9am–9pm weekends. Reserve the pool deck via the [Pool Reservations] page.
```

- Save. The page is live; Recent Changes picks it up automatically.

%%information🗣️ Talk-track: "Most HOA sites post news as a single rolling page with newest-on-top. If you'd rather have one page per announcement, create them as separate pages and link them from a News index — works either way."

%%

### The contact form

Visit `/contact` (signed out or signed in — works both ways).

Show the form: name, email, subject, message. Submit a test message.

- If mail is configured: an email goes to the configured recipient (an admin email address, or a distribution list).
- Either way: the submission is logged to disk. As admin you can find it under the data directory:

```bash
tail -20 /path/to/data/contact-submissions.log
```

Show this in a terminal during the demo. Each line is a JSON record with timestamp, IP, name, email, subject, message.

%%information🗣️ *Talk-track: "The persisted log is the receipt-of-record — even if mail fails, you can see who submitted what. There are honeypot + rate-limit defenses in front of the form so you don't get spammed."*

### Where the contact configuration lives

For mail to send, two pieces need to be set in the operator's `app-custom-config.json`:

```json
{
  "ngdpbase.mail.enabled": true,
  "ngdpbase.mail.provider": "smtp",
  "ngdpbase.mail.provider.smtp.host": "smtp.example.com",
  "ngdpbase.mail.provider.smtp.port": 587,
  "ngdpbase.mail.provider.smtp.user": "...",
  "ngdpbase.mail.provider.smtp.pass": "...",
  "ngdpbase.mail.from": "noreply@thefairways.example",
  "ngdpbase.application.contact.recipient": "board@thefairways.example"
}
```

Don't change this live — it requires a restart and the audience can't see the diff. Mention it exists and where it lives.

---

## Act 6 — Calendar & forms (5 min)

Goal: Show the two domain addons most relevant to an HOA / community: reservations and member forms. Only run this act if the calendar and forms addons are enabled on the site.

### Check first

Open `/admin/addons` — should show `calendar` and `forms` in the list, both enabled. If they're not enabled, skip this act or enable them now (`Admin → Addons → Enable`) and restart.

### Reservation calendar

If the calendar addon is wired into a page (e.g. `/view/Clubhouse-Reservations`):

- Navigate to the page in Window A (admin) and Window B (regular member).
- As regular member: click an open day → reservation form appears → submit a reservation for the clubhouse → see confirmation.
- As admin: open `/admin/events` (or whatever path the calendar admin lives at). See the new reservation, with the member's name and the time block. Approve or reject if approval flow is enabled.

%%information🗣️ *Talk-track: "Conflicts are detected at submission time — two members can't double-book the same hour. The admin view lets you override, reschedule, or delete if needed."*

### Member forms

If you have a forms-driven survey or interest form set up (e.g. `/view/Architecture-Request`):

- Walk through submitting one as a member.
- As admin, navigate to the form's submissions view to see the responses.

If no forms are set up yet, show what the admin form-builder looks like (drop-down for field types, schema-driven, no code needed). This is where an operator would set up a new "Vote for board candidate" or "Maintenance request" form.

%%information🗣️ *Talk-track: "Forms are JSON-defined — no programming. You list the fields, pick the types, give it a submission handler, and you have a working form. If you'd prefer a dedicated form for, say, lifeguard signup, that's a 10-minute admin task."*

---

## Act 7 — Operations (5 min)

Goal: What you do when something goes wrong, or once a quarter to stay healthy.

### Health check

```bash
curl -s http://jminim4:2121//api/health | jq .
```

Returns status JSON. Should always be `{"status":"healthy", ...}`. If it's not, jump to Logs.

### Logs

`/admin/logs` shows recent server log entries in the browser — easier than SSHing in for routine checks. Filter by level (info / warn / error). Things you'll see:

- `info` entries for every request
- `warn` for unusual but recoverable events (rate-limit hit, audience-deny on a public page, etc.)
- `error` for real problems

If you see repeated errors, copy the message and either fix the obvious cause (page that references a missing attachment, etc.) or send to the developer / installer.

### Recent Changes — what edits happened

`/view/Recent Changes` shows a chronological feed of every page edit. Useful for "did Molly post that announcement yet?" or "who edited the bylaws page last week?".

### Backups

`/admin/backup` shows existing backups and lets you create a new one.

- Click "Backup now" at the end of every demo. It's a few-second operation.
- Backups go into the configured backup directory. They include all pages, attachments, user data, and config — everything needed to restore.
- Restore is a one-line operation but you should not need to demonstrate it on a live demo; that's for an actual recovery scenario.

%%information
⚠️ Operator habit: take a manual backup before every config change, and before applying a platform update.

%%

### Updating the platform

The Fairways runs on ngdpbase. When a new version comes out:

```bash
cd /path/to/fairways-base
./server.sh stop
git pull
npm install     # only if dependencies changed (a `chore(deps)` line in the changelog tells you)
npm run build
./server.sh start
```

`./server.sh` is the only sanctioned way to start/stop. Don't use `pm2`, `kill`, or `node` directly — they bypass cleanup hooks. If a colleague tells you to do it, push back politely.

%%information🗣️ *Talk-track: "Patch releases (3.14.x → 3.14.y) are safe; minor releases (3.14.x → 3.15.0) may add a feature you'll want to read the changelog for. Major releases are rare and announced separately."*

### Routine restart

If something feels stuck — page not updating after a save, contact form throwing errors — the first try is always a restart:

```bash
./server.sh restart
```

That's it. Wait 30 seconds, refresh the page.

---

## What could go wrong — quick triage

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Page edits don't appear | Browser cache | Hard refresh (Cmd-Shift-R / Ctrl-Shift-R). If that doesn't fix it, restart server. |
| /contact returns "Forbidden — invalid CSRF token" | Form hidden state lost (rare) | Refresh the form page and resubmit. If it persists, check `/admin/logs` and call the installer. |
| Member can't log in | Wrong password or deactivated | `/admin/users` → find the member → either reset password or set Active=true. |
| Audience picker doesn't show roles | Browser JS disabled or extension blocking scripts | Try a different browser / disable extensions. |
| Whole site is down (curl returns nothing) | Server crashed or stopped | `./server.sh start` from the install directory. Check `/admin/logs` afterwards for a crash trace. |
| Contact email isn't arriving | Mail not configured, or SMTP credentials wrong | Submissions are still in `contact-submissions.log` regardless. Fix mail config (Act 5) and restart. |
| Backup directory is full | Old backups not pruned | `/admin/backup` → delete old ones, or set an auto-prune retention in config. |

---

## FAQ for your audience

| Question | Answer |
| --- | --- |
| Can residents edit pages? | Only if you give them the `editor` role. Most residents have `authenticated`, which is read-only for community content. |
| What if I make a bad edit? | Every page has a version history. `/view/<page>` → Info → History. Click any prior version → Restore. |
| Can we have multiple admins? | Yes. Add as many `admin` users as you trust. They have identical capabilities. |
| How do I see what's changed recently? | `/view/Recent Changes` for content edits; `/admin/logs` for system events. |
| Where is the data? | Two filesystem paths — one for "fast" data (sessions, search index, user accounts), one for "slow" data (pages, attachments, backups). Both are real directories you can `ls` and back up with `rsync`. |
| Can I run this in the cloud? | Yes — the platform is process-based and stateless except for the filesystem. Point both data directories at a network mount or a cloud filesystem and run anywhere. |
| What about mobile? | The site is responsive — works on phones. There is no app to install. |
| Privacy of contact submissions? | Submissions are stored only on your server. The platform never sends them to a third party. Email addresses are stripped from any rendered output (a member's address is never displayed to other members). |

---

## After the demo — operator's starter checklist

Hand this to the new operator at the end of the session:

1. [ ] Bookmark `/admin/users`, `/admin/logs`, `/admin/backup` — your three most-used admin URLs.
2. [ ] Take a manual backup via `/admin/backup`. Confirm the file appears in the backup directory.
3. [ ] Sign in once as a regular member (use a test account) and confirm what you see vs. what admins see.
4. [ ] Walk through one full content cycle: create a test page → set audience → publish → view from member side → delete it.
5. [ ] Verify the contact form: submit a test message, confirm it appears in `contact-submissions.log` (and in email if mail is configured).
6. [ ] Save the installer's contact info somewhere durable. You're going to need them when an update needs review or something genuinely breaks.

---

## Reference links

- Operator URLs:
  - `/admin/users` — member management
  - `/admin/roles` — role definitions
  - `/admin/addons` — feature toggles
  - `/admin/settings` — site configuration UI
  - `/admin/backup` — backups
  - `/admin/logs` — server log viewer
  - `/admin/required-pages` — manage system/UI pages (LeftMenu, Header, Footer)
- Member-facing URLs:
  - `/login`, `/profile`, `/contact`
  - `/view/Recent Changes`, `/view/PageIndex`
- Documentation:
  - Platform technical demo: [technical.md](./technical.md)
  - Page metadata reference: [architecture/Page-Metadata.md](../architecture/Page-Metadata.md)
  - Access control reference: [architecture/Access-Control.md](../architecture/Access-Control.md)
  - Contact / mail setup: search for `application.contact` and `mail.` in `config/app-default-config.json`
