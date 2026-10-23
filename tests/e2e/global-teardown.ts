import { request, type FullConfig } from '@playwright/test';
import fs from 'fs';

/**
 * #2008 — the end-of-run sweep: delete every page carrying the `test-artifact`
 * system keyword (#1355), so a run leaves no test pages behind on the instance
 * it ran against, including a spec's leftovers when its own cleanup failed.
 *
 * Through the site's API only, as the run's admin session (the one
 * `auth.setup.ts` saved): `POST /api/admin/test-artifacts/sweep`, which is
 * `admin-system`-gated and deletes nothing without the keyword. Each page it
 * deleted is then purged from the trash by uuid, the way `deletePage()` in
 * `fixtures/helpers.ts` purges what it deletes — never anything else in the
 * trash. It logs every page it deleted.
 *
 * A sweep the server refuses or that leaves pages behind fails the run: a
 * silent cleanup is how 73 test pages piled up on jimstest.
 */

const STORAGE_STATE = './tests/e2e/.auth/user.json';

export default async function globalTeardown(config: FullConfig): Promise<void> {
  if (!fs.existsSync(STORAGE_STATE)) {
    console.warn(`[teardown] No admin session at ${STORAGE_STATE} (did auth.setup.ts run?): test-artifact sweep skipped.`);
    return;
  }
  const baseURL = config.projects.find((p) => p.use?.baseURL)?.use.baseURL;
  const api = await request.newContext({ baseURL, storageState: STORAGE_STATE });
  try {
    // The origin the instance serves after its redirects (an https base URL
    // answers plain http with 308), so the POST below is not redirected.
    const origin = new URL((await api.get('/health/liveness')).url()).origin;
    const html = await (await api.get(`${origin}/login`)).text();
    const csrfToken = (html.match(/<meta name="csrf-token" content="([^"]+)"/) ?? [])[1];
    if (!csrfToken) throw new Error('[teardown] could not obtain a CSRF token from /login');
    const headers = { Accept: 'application/json', 'X-CSRF-Token': csrfToken };

    const res = await api.post(`${origin}/api/admin/test-artifacts/sweep`, { headers });
    if (res.status() !== 200) {
      throw new Error(`[teardown] test-artifact sweep answered ${res.status()}: ${await res.text()}`);
    }
    const body = await res.json() as {
      deleted: Array<{ title: string; uuid: string }>;
      failed: Array<{ title: string; uuid: string; error: string }>;
    };
    console.log(`[teardown] Deleted ${body.deleted.length} test-artifact page(s)${body.deleted.length ? ':' : '.'}`);
    for (const page of body.deleted) {
      console.log(`[teardown]   ${page.title} (${page.uuid})`);
      // Storage hygiene only, like purgeDeletedPage(): the page is already
      // gone from every user-visible surface.
      await api.delete(`${origin}/api/admin/deleted-pages/${encodeURIComponent(page.uuid)}`, { headers }).catch(() => undefined);
    }
    if (body.failed.length > 0) {
      throw new Error(`[teardown] ${body.failed.length} test-artifact page(s) not deleted:\n` +
        body.failed.map((f) => `  ${f.title}: ${f.error}`).join('\n'));
    }
  } finally {
    await api.dispose();
  }
}
