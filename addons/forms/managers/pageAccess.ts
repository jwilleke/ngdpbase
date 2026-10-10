
/**
 * Who may submit a form is decided by the page it is on.
 *
 * The form posts the name of its page. The submit is allowed only when:
 *   1. the viewer may read that page (the page door, PageManager.readPage),
 *   2. that page really carries this form — otherwise a form could be posted
 *      "from" any page whose rules are looser, and
 *   3. the viewer may `form-submit` on it: the page's own front matter
 *      `access: { form-submit: [...] }` when it states one, else site policy.
 *
 * The page's `audience` decides who sees the form at all, and `author-lock`
 * keeps those rules from being loosened by anyone who can edit the page.
 * A handler's own manager still asks its own permission; this does not
 * replace that.
 */

import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';

export const SUBMIT_ACTION = 'form-submit';

export type SubmitAccess = { ok: true } | { ok: false; status: number; error: string };

interface PageReader {
  readPage(identifier: string, ctx: unknown): Promise<
    { ok: true; name: string; metadata: Record<string, unknown>; value: { content?: string } } | { ok: false; refusal: string }
  >;
}

interface PageAccessPoint {
  canUserAccessPage(userContext: unknown, pageName: string, action: string, knownMetadata?: Record<string, unknown>): Promise<boolean>;
}

/** True when the page markup holds `[{Form id='<formId>' ...}]`. */
export function pageCarriesForm(content: string, formId: string): boolean {
  const id = formId.replace(/[^a-z0-9-]/g, '');
  if (id === '') return false;
  const re = new RegExp(`\\[\\{\\s*Form\\s[^}]*\\bid\\s*=\\s*(['"]?)${id}\\1(?=[\\s}])`);
  return re.test(content);
}

export async function checkSubmitAccess(
  engine: WikiEngine,
  userContext: unknown,
  pageName: string | undefined,
  formId: string
): Promise<SubmitAccess> {
  if (!pageName) return { ok: false, status: 400, error: 'The form did not say which page it is on' };

  const pages = engine.getManager<PageReader>('PageManager');
  const pip = engine.getManager<PageAccessPoint>('PolicyInformationPoint');
  if (!pages || !pip) return { ok: false, status: 503, error: 'Page access is not available' };

  const read = await pages.readPage(pageName, userContext);
  if (!read.ok) return { ok: false, status: 404, error: 'Form not found' };
  if (!pageCarriesForm(read.value.content ?? '', formId)) return { ok: false, status: 404, error: 'Form not found' };

  const allowed = await pip.canUserAccessPage(userContext, read.name, SUBMIT_ACTION, read.metadata);
  return allowed ? { ok: true } : { ok: false, status: 403, error: 'You may not submit this form' };
}
