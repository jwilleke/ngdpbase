/**
 * One CSV writer for every export: RFC 4180 quoting, CRLF line ends, and
 * cells a spreadsheet would run as a formula neutralised.
 *
 * A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is
 * run as a formula by Excel, LibreOffice and Google Sheets ("CSV injection",
 * OWASP), so a text cell starting with one gets a leading `'`. Numbers are
 * written as numbers: a negative amount stays `-12550`.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

/** One field: quoted when it holds a comma, quote or line break; text that would run as a formula is prefixed with `'`. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A header row and data rows as one CSV document, each line ending CRLF. */
export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
