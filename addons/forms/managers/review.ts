/**
 * "Needs review" forms (#2072): the review handler forms registers with core,
 * which is also the kind of request it files, and the two details of a request
 * the handler reads back to find the submission.
 */
import type { ActorContext } from '../../../dist/src/context/ActorContext.js';
import type { ReviewHandler } from '../../../dist/src/types/Review.js';
import type { FormSubmission } from './FormsDataManager.js';
import type FormsDataManager from './FormsDataManager.js';

export const FORMS_REVIEW_HANDLER = 'forms.submission';
export const REVIEW_FORM_KEY = 'Form id';
export const REVIEW_SUBMISSION_KEY = 'Submission id';

/** What the review handler needs from the add-on: its data, its form handlers, and somewhere to log. */
export interface FormsReviewDeps {
  data: () => Pick<FormsDataManager, 'getDefinition' | 'getSubmission' | 'updateStatus'> | null;
  callHandler: (formId: string, submission: FormSubmission, decider: ActorContext) => Promise<{ ok: boolean; error?: string }>;
  warn: (message: string) => void;
}

/**
 * The handler core calls when a reviewer approves a submission to a form that
 * needs review: the form's own handler runs now, with the reviewer's context,
 * and the submission is marked processed. Throwing leaves the request open,
 * with the message shown to reviewers.
 */
export function formsReviewHandler(deps: FormsReviewDeps): ReviewHandler {
  return async (request, ctx) => {
    const m = deps.data();
    if (!m) throw new Error('The forms add-on is not running');
    const formId = String(request.details[REVIEW_FORM_KEY] ?? '');
    const submissionId = String(request.details[REVIEW_SUBMISSION_KEY] ?? '');
    const form = m.getDefinition(formId);
    const submission = await m.getSubmission(formId, submissionId);
    if (!form || !submission) throw new Error('The form or the submission is no longer stored, so there is nothing to carry out');
    const result = await deps.callHandler(formId, submission, ctx);
    if (!result.ok) throw new Error(result.error ?? 'The form\'s handler did not accept it');
    if (!(await m.updateStatus(submissionId, formId, 'processed'))) {
      deps.warn(`[forms] submission ${submissionId} to '${formId}' was approved and carried out, but its status could not be set to processed`);
    }
    return { summary: form.handler ? `The submission to "${form.title}" was accepted and carried out` : `The submission to "${form.title}" was accepted` };
  };
}
