/**
 * The level a grant stores, and the level a subject has (#2261 slice 3).
 *
 * A token's or a job's level is set when the grant is made, from the session of
 * whoever makes it, and can never be higher than that session's. A grant with
 * none stored has none. Sabotage check: read `aal` from the request in
 * `jobContextFromRequest` or `mint`, or drop the `aalCap`, and the cap rows go red.
 */
import { effectiveAal, aalFactsOf, declaredSubjectAttributes, subjectAttributesProblems, PINNED_SUBJECT_ATTRIBUTES } from '../policyAttributes';
import { jobContextFromRequest, toPermissionSubject } from '../../context/JobContext';

const signIn = (aal: number) => ({ provider: 'password', factors: [], at: '2026-01-01T00:00:00Z', aal });
const session = (aal: number | null, extra: Record<string, unknown> = {}) => ({ username: 'quinn', isAuthenticated: true, ...(aal === null ? {} : { signIn: signIn(aal) }), ...extra });

describe('effectiveAal', () => {
  test.each([1, 2, 3])('a session signed in at AAL%i has it', (aal) => {
    expect(effectiveAal(session(aal))).toBe(aal);
  });

  test('a session with no sign-in record is AAL 1', () => {
    expect(effectiveAal(session(null))).toBe(1);
  });

  test('a sign-in record with a level that is not 1 to 3 has none, and is never coerced', () => {
    for (const aal of [0, 4, '2', 2.5, null, undefined]) expect(effectiveAal({ isAuthenticated: true, signIn: { aal } })).toBeUndefined();
  });

  test('nobody signed in, and a share visitor, have none', () => {
    expect(effectiveAal(null)).toBeUndefined();
    expect(effectiveAal({ isAuthenticated: false, signIn: signIn(3) })).toBeUndefined();
    expect(effectiveAal(session(3, { viaShare: { id: 's' } }))).toBeUndefined();
  });

  test('the level never exceeds aalCap', () => {
    expect(effectiveAal(session(3, { aalCap: 2 }))).toBe(2);
    expect(effectiveAal(session(1, { aalCap: 3 }))).toBe(1);
    expect(effectiveAal(session(null, { aalCap: 1 }))).toBe(1);
  });

  test('a token has its stored level, and none when it has none; the session\'s is not read', () => {
    expect(effectiveAal(session(1, { viaToken: { aal: 2 } }))).toBe(2);
    expect(effectiveAal(session(3, { viaToken: {} }))).toBeUndefined();
    expect(effectiveAal(session(3, { viaToken: { aal: 9 } }))).toBeUndefined();
  });

  test('a job has its stored level, and none when it has none', () => {
    expect(effectiveAal({ isAuthenticated: true, resolveRolesNow: true, grantedAal: 2 })).toBe(2);
    expect(effectiveAal({ isAuthenticated: true, resolveRolesNow: true })).toBeUndefined();
    expect(effectiveAal({ isAuthenticated: true, resolveRolesNow: true, grantedAal: 2, signIn: signIn(3) })).toBe(2);
  });
});

describe('a job requested by a user stores that user\'s level (job grants)', () => {
  test('a job requested from an AAL2 session carries 2, from an AAL1 session 1', () => {
    expect(jobContextFromRequest(session(2)).aal).toBe(2);
    expect(jobContextFromRequest(session(1)).aal).toBe(1);
  });

  test('it never exceeds the requesting session\'s level, whatever else the identity carries', () => {
    const forged = { ...session(1), aal: 3, grantedAal: 3 } as never;
    expect(jobContextFromRequest(forged).aal).toBe(1);
    expect(jobContextFromRequest(session(3, { aalCap: 1 })).aal).toBe(1);
  });

  test('a job requested with a token carries the token\'s level; a token with none gives the job none', () => {
    expect(jobContextFromRequest(session(1, { viaToken: { id: 't', name: 'n', scopes: [], aal: 2 } })).aal).toBe(2);
    expect(jobContextFromRequest(session(3, { viaToken: { id: 't', name: 'n', scopes: [] } })).aal).toBeUndefined();
  });

  test('work no session asked for has none: a request with no identity, a share, the system', () => {
    expect(jobContextFromRequest(null).aal).toBeUndefined();
    expect(jobContextFromRequest({ username: 'System' }).aal).toBeUndefined();
    expect(jobContextFromRequest(session(3, { viaShare: { id: 's' } })).aal).toBeUndefined();
  });

  test('a job context stored before this has no level, and its subject has none', () => {
    const old = { username: 'quinn', origin: 'request' as const, requestedAt: '2026-01-01T00:00:00Z' };
    expect(toPermissionSubject(old)).not.toHaveProperty('grantedAal');
    expect(toPermissionSubject({ ...old, aal: 2 })).toMatchObject({ grantedAal: 2 });
  });
});

describe('the level a job stores is the granting session\'s, whatever object carries it (#2287)', () => {
  // The shapes callers hand over: a request subject, an ApiContext (its `subject`), a WikiContext (its `userContext`), a JobContext handed back in.
  const apiContext = (subject: Record<string, unknown>) => ({ username: subject.username as string, isAuthenticated: true, subject });
  const wikiContext = (subject: Record<string, unknown>) => ({ userContext: subject });
  const jobContext = (aal?: number) => ({ username: 'quinn', origin: 'request', requestedAt: '2026-01-01T00:00:00Z', ...(aal ? { aal } : {}) });

  test('an AAL2 session through ApiContext stores 2, not 1', () => {
    expect(jobContextFromRequest(apiContext(session(2)) as never).aal).toBe(2);
    expect(jobContextFromRequest(apiContext(session(3, { aalCap: 2 })) as never).aal).toBe(2);
  });

  test('a WikiContext stores its session\'s level', () => {
    expect(jobContextFromRequest(wikiContext(session(2)) as never).aal).toBe(2);
    expect(jobContextFromRequest(wikiContext(session(1)) as never).aal).toBe(1);
  });

  test('a JobContext handed back in keeps its level, and a forged one is not believed on a request', () => {
    expect(jobContextFromRequest(jobContext(2) as never).aal).toBe(2);
    expect(jobContextFromRequest(jobContext() as never).aal).toBeUndefined();
    expect(jobContextFromRequest(jobContext(7) as never).aal).toBeUndefined();
  });

  test('a token or share behind the wrapper still gives the token\'s level, or none', () => {
    expect(jobContextFromRequest(apiContext(session(1, { viaToken: { id: 't', name: 'n', scopes: [], aal: 2 } })) as never).aal).toBe(2);
    expect(jobContextFromRequest(wikiContext(session(3, { viaShare: { id: 's' } })) as never).aal).toBeUndefined();
    expect(jobContextFromRequest(apiContext(session(3, { viaToken: { id: 't', name: 'n', scopes: [] } })) as never).aal).toBeUndefined();
  });
});

describe('a bearer JWT with no recorded sign-in level has no subject:aal (#2287)', () => {
  test('it is missing, not AAL 1, and not the AAL 1 of a session from before #1523', () => {
    expect(effectiveAal({ isAuthenticated: true, bearerWithoutLevel: true })).toBeUndefined();
    expect(effectiveAal({ isAuthenticated: true, bearerWithoutLevel: true, aalCap: 3 })).toBeUndefined();
    // the pre-#1523 session, which has no sign-in record, is still 1
    expect(effectiveAal({ isAuthenticated: true })).toBe(1);
  });

  test('the marker survives the PDP\'s rebuild of the subject', () => {
    expect(aalFactsOf({ bearerWithoutLevel: true })).toMatchObject({ bearerWithoutLevel: true });
    expect(effectiveAal({ ...aalFactsOf({ bearerWithoutLevel: true }), isAuthenticated: true })).toBeUndefined();
  });
});

describe('id and aal are pinned (#2287)', () => {
  const evil = { id: { type: 'string', from: 'profile:department' }, aal: { type: 'integer', from: 'account:level' }, 'department-id': { type: 'string', from: 'profile:department' } };

  test('config cannot redefine them; other declarations are kept', () => {
    const declared = declaredSubjectAttributes(evil);
    expect(declared.aal).toEqual({ type: 'integer', from: 'sign-in' });
    expect(declared.id).toEqual({ type: 'identity', from: 'account:id' });
    expect(declared['department-id']).toEqual(evil['department-id']);
  });

  test('they are there when config declares nothing, or not an object', () => {
    for (const raw of [null, undefined, [], 'x']) expect(Object.keys(declaredSubjectAttributes(raw)).sort()).toEqual(['aal', 'id']);
  });

  test('declaring either with another meaning is reported; the same declaration is not', () => {
    const problems = subjectAttributesProblems(evil, []);
    expect(problems).toHaveLength(2);
    expect(problems.join(' ')).toContain("'aal' in ngdpbase.access.subject-attributes cannot be redefined");
    expect(problems.join(' ')).toContain("'id' in ngdpbase.access.subject-attributes cannot be redefined");
    expect(subjectAttributesProblems({ id: PINNED_SUBJECT_ATTRIBUTES.id, aal: PINNED_SUBJECT_ATTRIBUTES.aal }, [])).toEqual([]);
    expect(subjectAttributesProblems({ aal: null }, []).join(' ')).toContain('cannot be redefined');
  });

  test('other declarations are checked as before; not-an-object is reported; nothing is fine', () => {
    expect(subjectAttributesProblems({ d: { type: 'string', from: 'account:password' } }, ['password']).join(' ')).toContain("'account:password' cannot be used");
    expect(subjectAttributesProblems({ d: { type: 'string', from: 'profile:department' } }, ['password'])).toEqual([]);
    expect(subjectAttributesProblems(['x'], [])).toHaveLength(1);
    expect(subjectAttributesProblems(null, [])).toEqual([]);
  });
});
