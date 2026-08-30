/**
 * #1128 — one save, one audit record.
 *
 * #1121 gap C made PageManager.savePageWithContext the single emission point
 * for page.* mutation events, and the /save handler passes the client IP down
 * via `audit: { ipAddress }`. The route-level emission from #1080 was left in
 * place, so every create/edit/rename through /save was recorded twice —
 * identical events, same millisecond, consecutive seq (live evidence on the
 * issue).
 *
 * PageManager.audit.test.ts pins "reaching the provider means a record was
 * emitted". This file pins the other half of the invariant: the route layer
 * emits no page-mutation event of its own. It scans the source rather than
 * mocking the full /save flow because the failure mode is precisely a
 * SECOND emission an integration mock would have to know to count — if a
 * route-level emission ever becomes legitimate again, delete this test
 * consciously alongside reintroducing it.
 */
import { readFileSync } from 'fs';
import path from 'path';

const source = readFileSync(path.join(__dirname, '..', 'WikiRoutes.ts'), 'utf8');

describe('#1128 the route layer does not emit page-mutation audit events', () => {
  test('no auditPageMutation helper or call remains in WikiRoutes', () => {
    expect(source).not.toMatch(/auditPageMutation/);
  });

  test('WikiRoutes never builds a page-mutation event itself', () => {
    // buildPageMutationAuditEvent belongs to PageManager (the door). The
    // route's audit surface is deletes (built inline), attachments, and
    // passing `audit: { ipAddress }` / op overrides down to the manager.
    expect(source).not.toMatch(/buildPageMutationAuditEvent/);
  });

  test('the save path still hands the client IP to the manager emission', () => {
    expect(source).toMatch(/audit:\s*\{\s*ipAddress:\s*req\.ip\s*\}/);
  });
});
