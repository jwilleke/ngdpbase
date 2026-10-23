#!/usr/bin/env tsx
/**
 * @file scripts/sweep-test-pages.ts
 * @description One-off cleanup of test pages earlier E2E runs left behind (#2008).
 *
 * Before #2008 an E2E run left pages on the instance it ran against: profile
 * pages of deleted test accounts, `E2E Import …` pages, and `NGDPBASE-test-…`
 * pages, most without the `test-artifact` keyword the end-of-run sweep finds.
 * This finds them by name, over HTTP, as an administrator of a running site —
 * it never touches files.
 *
 * A page is a leftover when its title starts with one of:
 *   - `Profile: e2e-`   and no account exists (active or not) whose username
 *                       or display name is the rest of the title;
 *   - `E2E Import `;
 *   - `NGDPBASE-test-`.
 *
 * Usage:
 *   npm run sweep:test-pages -- --base-url https://site.example            # dry run: list only
 *   npm run sweep:test-pages -- --base-url https://site.example --apply    # delete them
 *
 * Options:
 *   --base-url <url>        the site (default: $NGDPBASE_BASE_URL)
 *   --storage-state <file>  a Playwright storage state holding an admin session
 *                           (default: tests/e2e/.auth/user.json, which
 *                           `npx playwright test --project=setup` writes)
 *   --cookie <cookie>       a Cookie header instead (default: $NGDPBASE_SWEEP_COOKIE)
 *   --apply                 delete; without it nothing is changed
 *
 * The session must act as admin (admin needs a passkey sign-in where passkeys
 * are on, which is why a password alone will not do). Deletes go through
 * `DELETE /api/page/:identifier`: recorded as `page-delete`, and soft, so each
 * page sits in the trash (Admin, Deleted pages) for the retention window.
 */

import fs from 'fs';

const PREFIXES = ['Profile: e2e-', 'E2E Import ', 'NGDPBASE-test-'] as const;
const PROFILE_PREFIX = 'Profile: ';

interface Options { baseUrl: string; storageState: string; cookie: string; apply: boolean }

function parseArgs(argv: string[]): Options {
  const value = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    baseUrl: value('--base-url') ?? process.env.NGDPBASE_BASE_URL ?? '',
    storageState: value('--storage-state') ?? 'tests/e2e/.auth/user.json',
    cookie: value('--cookie') ?? process.env.NGDPBASE_SWEEP_COOKIE ?? '',
    apply: argv.includes('--apply')
  };
}

/** The Cookie header for `origin`, from a Playwright storage state. */
function cookieFromStorageState(file: string, origin: URL): string {
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { cookies?: Array<{ name: string; value: string; domain: string }> };
  const host = origin.hostname;
  return (state.cookies ?? [])
    .filter((c) => { const d = c.domain.replace(/^\./, ''); return host === d || host.endsWith(`.${d}`); })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.baseUrl) throw new Error('No site: pass --base-url or set NGDPBASE_BASE_URL');

  // The origin the site serves after its redirects (http → https).
  const origin = new URL((await fetch(new URL('/health/liveness', opts.baseUrl))).url);
  const cookie = opts.cookie || cookieFromStorageState(opts.storageState, origin);
  if (!cookie) throw new Error(`No session cookie for ${origin.host} (in ${opts.storageState}, --cookie or NGDPBASE_SWEEP_COOKIE)`);
  const get = (path: string): Promise<Response> => fetch(new URL(path, origin), { headers: { Cookie: cookie, Accept: 'application/json' }, redirect: 'manual' });

  const admin = await get('/admin');
  if (admin.status !== 200) throw new Error(`GET /admin answered ${admin.status}: the session does not act as admin on ${origin.host}`);

  // Every page whose title starts with a prefix, as the admin sees them.
  const titles = new Set<string>();
  for (const prefix of PREFIXES) {
    const res = await get(`/api/page-suggestions?q=${encodeURIComponent(prefix)}&limit=100000`);
    if (res.status !== 200) throw new Error(`page-suggestions answered ${res.status}`);
    const body = await res.json() as { suggestions?: Array<{ name?: string; title?: string }> };
    for (const s of body.suggestions ?? []) {
      const title = String(s.name ?? s.title ?? '');
      if (title.startsWith(prefix)) titles.add(title);
    }
  }

  // A profile page is kept while an account it could belong to exists.
  const leftovers: string[] = [];
  const kept: string[] = [];
  for (const title of [...titles].sort()) {
    if (title.startsWith(PROFILE_PREFIX)) {
      const name = title.slice(PROFILE_PREFIX.length);
      const res = await get(`/api/users/search?q=${encodeURIComponent(name)}&activeOnly=false&limit=1000`);
      if (res.status !== 200) throw new Error(`users/search answered ${res.status}`);
      const { results = [] } = await res.json() as { results?: Array<{ username?: string; displayName?: string }> };
      if (results.some((u) => u.username === name || u.displayName === name)) { kept.push(title); continue; }
    }
    leftovers.push(title);
  }

  console.log(`${origin.host}: ${leftovers.length} leftover test page(s)${opts.apply ? '' : ' (dry run — nothing changed; --apply deletes)'}`);
  for (const title of leftovers) console.log(`  ${title}`);
  if (kept.length) {
    console.log(`Kept ${kept.length} profile page(s) of accounts that still exist:`);
    for (const title of kept) console.log(`  ${title}`);
  }
  if (!opts.apply || leftovers.length === 0) return;

  // A signed-in /login redirects on; the page it lands on carries the token.
  const html = await (await fetch(new URL('/login', origin), { headers: { Cookie: cookie, Accept: 'text/html' } })).text();
  const csrfToken = (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1];
  if (!csrfToken) throw new Error('Could not obtain a CSRF token from /login');
  let failed = 0;
  for (const title of leftovers) {
    const res = await fetch(new URL(`/api/page/${encodeURIComponent(title)}`, origin), {
      method: 'DELETE', redirect: 'manual',
      headers: { Cookie: cookie, Accept: 'application/json', 'X-CSRF-Token': csrfToken }
    });
    if (res.status === 200) {
      console.log(`  deleted ${title}`);
    } else {
      failed += 1;
      console.error(`  NOT deleted ${title}: ${res.status} ${await res.text()}`);
    }
  }
  console.log(`Deleted ${leftovers.length - failed}, failed ${failed}. Deleted pages stay in the trash for the retention window.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
