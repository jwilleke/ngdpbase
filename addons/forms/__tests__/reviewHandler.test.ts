/**
 * #2072: what forms does when a reviewer approves a submission to a form that
 * needs review. Sabotaged once each (then restored): the decider passed on
 * replaced by null ("runs the form's handler…" went red); the throw on a
 * refused handler removed ("…leaves it open" went red).
 */
import { formsReviewHandler, REVIEW_FORM_KEY, REVIEW_SUBMISSION_KEY } from '../managers/review';

const form = { id: 'new-owner', title: 'New owner', handler: 'accommodation', fields: [] };
const submission = { id: 's1', formId: 'new-owner', submittedAt: '2026-10-25T00:00:00Z', submittedBy: 'anonymous', data: { name: 'Pat' }, status: 'pending' };
const request = { details: { [REVIEW_FORM_KEY]: 'new-owner', [REVIEW_SUBMISSION_KEY]: 's1' } } as never;
const dana = { username: 'dana', roles: ['reader'], isAuthenticated: true } as never;

function deps(ok: boolean) {
  const statuses: string[] = [];
  const calls: unknown[] = [];
  return {
    statuses, calls,
    d: {
      data: () => ({
        getDefinition: () => form,
        getSubmission: () => Promise.resolve(submission),
        updateStatus: (_id: string, _f: string, s: string) => { statuses.push(s); return Promise.resolve(true); }
      }) as never,
      callHandler: (formId: string, sub: unknown, decider: unknown) => { calls.push([formId, sub, decider]); return Promise.resolve(ok ? { ok: true } : { ok: false, error: 'Unit 12B already has two owners' }); },
      warn: () => undefined
    }
  };
}

test('runs the form\'s handler with the reviewer\'s context and marks the submission processed', async () => {
  const { d, calls, statuses } = deps(true);
  const result = await formsReviewHandler(d)(request, dana);
  expect(calls).toEqual([['new-owner', submission, dana]]);
  expect(statuses).toEqual(['processed']);
  expect(result.summary).toContain('New owner');
});

test('a handler that refuses throws its message, so the request stays open', async () => {
  const { d, statuses } = deps(false);
  await expect(formsReviewHandler(d)(request, dana)).rejects.toThrow('Unit 12B already has two owners');
  expect(statuses).toEqual([]);
});
