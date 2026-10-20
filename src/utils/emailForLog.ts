/**
 * emailForLog — the one way an email address reaches the server log (#1916).
 *
 * Rule (operator, 2026-10-20): a full email address never reaches the server
 * log. A log line names the address's domain only. Audit records are not the
 * server log and keep full addresses; do not use these helpers on them.
 */

/**
 * The domain(s) of one address or a comma-separated list, lower-cased:
 * `"Bob <bob@Example.org>, ann@x.io"` → `"example.org,x.io"`. A value
 * without an `@` (or an empty one) reads as `unknown`.
 */
export function emailDomain(to: string | null | undefined): string {
  const domains = new Set(
    String(to ?? '').split(',').map((a) => a.trim()).filter(Boolean)
      .map((a) => (a.includes('@') ? a.slice(a.lastIndexOf('@') + 1).replace(/>$/, '').toLowerCase() : 'unknown'))
  );
  return [...domains].join(',') || 'unknown';
}

/**
 * Any address inside free text (an SMTP error often quotes the rejected one)
 * cut to its domain: `bob@example.org` → `…@example.org`.
 */
export function redactEmailAddresses(text: string): string {
  return text.replace(/[^\s<>"'@,;:()[\]]+@([A-Za-z0-9.-]+)/g, '…@$1');
}

/** An error's message, with any address in it cut to its domain. */
export function errorForLog(err: unknown): string {
  return redactEmailAddresses(err instanceof Error ? err.message : String(err));
}
