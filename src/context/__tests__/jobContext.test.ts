/**
 * #631 — a background job now says who asked for it, and from where.
 *
 * `BackgroundJobManager.enqueue(jobId)` took a job id and nothing else, so the
 * identity of whoever triggered the work was discarded at the call site:
 * `WikiRoutes` logged `Page reindex requested by: jim` on one line and threw
 * the name away on the next. All three jobs reached the audit log with nobody
 * attached, while `Security-auditing.md` marked Attribution "already met".
 *
 * The contract these tests hold is narrow and deliberate:
 *
 * - identity and provenance TRAVEL — who, from where, and via which token;
 * - authority does NOT — resolved roles are absent, because a job runs later
 *   and must not authorise against roles as they were when the button was
 *   pressed (the same reasoning `app.ts` gives for agent tokens).
 */
import {
  jobContextFromRequest,
  jobContextFromSystem,
  jobContextFromSchedule,
  toPermissionSubject,
  describeJobContext,
  SYSTEM_USERNAME
} from '../JobContext';

const at = new Date('2026-09-02T10:00:00.000Z');
const token = { id: 'tok-1', name: 'reader', scopes: ['page-read'] };

describe('#631 — derived from the request that triggered the work', () => {
  test('carries the username and marks the origin', () => {
    const ctx = jobContextFromRequest({ username: 'jim' }, at);
    expect(ctx.username).toBe('jim');
    expect(ctx.origin).toBe('request');
    expect(ctx.requestedAt).toBe('2026-09-02T10:00:00.000Z');
  });

  test('viaToken SURVIVES the reduction', () => {
    // The load-bearing assertion. A job enqueued by a token-bearing request
    // would otherwise escape the agent-token ceiling simply by becoming
    // asynchronous — the token is gone the moment the request returns.
    // Dropping roles here is the point; dropping this is the #1164 defect.
    const ctx = jobContextFromRequest({ username: 'jim', viaToken: token }, at);
    expect(ctx.viaToken).toEqual(token);
  });

  test('a request without a token carries none, rather than an empty one', () => {
    const ctx = jobContextFromRequest({ username: 'jim' }, at);
    expect('viaToken' in ctx).toBe(false);
  });

  test('resolved roles do NOT travel', () => {
    // A reindex enqueued at 09:00 and running at 09:12 must not authorise
    // against 09:00's roles. Demote the user in between and the job would keep
    // rights they no longer hold.
    const ctx = jobContextFromRequest(
      { username: 'jim', roles: ['admin'] }, at
    ) as Record<string, unknown>;
    expect('roles' in ctx).toBe(false);
  });

  test('an absent identity becomes System rather than undefined', () => {
    expect(jobContextFromRequest(null, at).username).toBe(SYSTEM_USERNAME);
    expect(jobContextFromRequest(undefined, at).username).toBe(SYSTEM_USERNAME);
  });
});

describe('#631 — standing on its own, with no request', () => {
  test('a system context names itself and says why', () => {
    // This is the constructor #1173 needs: once it exists, EVERY caller has a
    // context to pass, so `hasPermission`'s username-string overload has no
    // remaining justification.
    const ctx = jobContextFromSystem('nightly retention', at);
    expect(ctx.username).toBe(SYSTEM_USERNAME);
    expect(ctx.origin).toBe('boot');
    expect(ctx.reason).toBe('nightly retention');
  });

  test('a scheduled context differs only in origin', () => {
    const ctx = jobContextFromSchedule('hourly reindex', at);
    expect(ctx.origin).toBe('schedule');
    expect(ctx.reason).toBe('hourly reindex');
  });

  test('reason is required by the signature, not optional', () => {
    // An ownerless action that cannot say why it happened is what an assessor
    // asks about. Compile-time, so this asserts the runtime half only.
    expect(jobContextFromSystem('because').reason).toBeTruthy();
  });
});

describe('#631 — asking a permission question later', () => {
  test('the subject omits roles so they are resolved fresh', () => {
    const subject = toPermissionSubject(jobContextFromRequest({ username: 'jim' }, at));
    expect(subject.username).toBe('jim');
    expect(subject.roles).toBeUndefined();
  });

  test('the subject still carries the token, so the ceiling applies', () => {
    // Without this a token-triggered job would ask permission questions as its
    // owner, unrestricted — exactly the #1164 vulnerability, reached by a
    // different route.
    const subject = toPermissionSubject(
      jobContextFromRequest({ username: 'jim', viaToken: token }, at)
    );
    expect(subject.viaToken).toEqual(token);
  });

  // #631 option 1 / #1198: the system principal is a subject policy can name.
  // It used to be `isAuthenticated: false` with no roles, which meant every
  // `isAuthenticated` gate refused it before policy was asked, and policy —
  // had it been asked — would have seen anonymous. A principal that cannot act
  // is not a principal; it is a placeholder that fails closed by accident.
  test('a system subject holds the system role and nothing else', () => {
    const subject = toPermissionSubject(jobContextFromSystem('boot'));
    expect(subject.username).toBe(SYSTEM_USERNAME);
    expect(subject.roles).toEqual(['system']);
    expect(subject.isAuthenticated).toBe(true);
  });

  test('the system subject does NOT hold All — it gets only what a policy names for it', () => {
    expect(toPermissionSubject(jobContextFromSchedule('retention')).roles).not.toContain('All');
  });

  test('the system role follows the ORIGIN, never the username', () => {
    // A person who registers as "System" and triggers a job is still that
    // person: roles are absent so they resolve to the real user record, and the
    // system role is not among them.
    const subject = toPermissionSubject(jobContextFromRequest({ username: SYSTEM_USERNAME }, at));
    expect(subject.roles).toBeUndefined();
  });

  test('a request-origin subject is authenticated and resolves fresh', () => {
    const subject = toPermissionSubject(jobContextFromRequest({ username: 'jim' }, at));
    expect(subject.isAuthenticated).toBe(true);
    expect(subject.roles).toBeUndefined();
  });
});

describe('#631 — the audit line', () => {
  test('names who, from where, and how', () => {
    expect(describeJobContext(jobContextFromRequest({ username: 'jim', viaToken: token }, at)))
      .toBe('jim (request) via token tok-1 ("reader")');
  });

  test('a system job says why instead', () => {
    expect(describeJobContext(jobContextFromSystem('retention pass', at)))
      .toBe('System (boot) — retention pass');
  });
});
