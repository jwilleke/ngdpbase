/**
 * The details of a submission as plain text, for the submitter's copy email
 * (#1915): read as the form showed them. Each field under its label, money
 * through core's formatMoney, a dropdown's or checklist's values by the labels
 * of the choices the form offered this submitter, and each `lines` row with
 * its sub-fields.
 */

import type { FormOption } from '../../../dist/src/utils/pluginFormatters.js';
import { FORMS_CURRENCY } from './FormsDataManager.js';
import type { FormDefinition, FormField } from './FormsDataManager.js';

type FormatMoney = (minorUnits: number, currency: string) => string;

/**
 * One line per field that holds a value, indented for the email's Details
 * block. Hidden and section fields carry nothing to show.
 *
 * @param form - The form submitted
 * @param data - The validated submission data (amounts in minor units)
 * @param options - The choices resolved for this submitter, keyed as resolveChoiceOptions keys them
 * @param formatMoney - Core's money formatter (PluginManager.formatters.formatMoney)
 */
export function submissionDetails(
  form: FormDefinition,
  data: Record<string, unknown>,
  options: Map<string, FormOption[]>,
  formatMoney: FormatMoney
): string[] {
  const out: string[] = [];
  for (const answer of submissionAnswers(form, data, options, formatMoney)) {
    if (answer.rows) {
      out.push(`  ${answer.label}:`);
      answer.rows.forEach((row, i) => out.push(`    ${i + 1}. ${row}`));
    } else {
      out.push(`  ${answer.label}: ${answer.text}`);
    }
  }
  return out;
}

/** One answer of a submission: a field's label and its text, or a `lines` field's rows. */
export interface SubmissionAnswer {
  label: string;
  text: string;
  rows?: string[];
}

/**
 * The answers {@link submissionDetails} prints, one per field that holds a
 * value: the same text, so the email and a review request (#2072) read alike.
 */
export function submissionAnswers(
  form: FormDefinition,
  data: Record<string, unknown>,
  options: Map<string, FormOption[]>,
  formatMoney: FormatMoney
): SubmissionAnswer[] {
  const out: SubmissionAnswer[] = [];
  for (const field of form.fields) {
    if (field.type === 'hidden' || field.type === 'section') continue;
    if (field.type === 'lines') {
      const rowsData = Array.isArray(data[field.name]) ? (data[field.name] as Array<Record<string, unknown>>) : [];
      if (rowsData.length === 0) continue;
      const rows = rowsData.map((row) => (field.fields ?? [])
        .map(sub => [sub.label, valueText(sub, row[sub.name], options.get(`${field.name}.${sub.name}`), formatMoney)])
        .filter(([, text]) => text !== '')
        .map(([label, text]) => `${label}: ${text}`)
        .join(' · '));
      out.push({ label: field.label, text: rows.map((r, i) => `${i + 1}. ${r}`).join('; '), rows });
      continue;
    }
    const text = valueText(field, data[field.name], options.get(field.name), formatMoney);
    if (text !== '') out.push({ label: field.label, text });
  }
  return out;
}

/** One value as the form showed it, or '' for nothing to show. */
function valueText(field: FormField, value: unknown, options: FormOption[] | undefined, formatMoney: FormatMoney): string {
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (field.type === 'amount') return typeof value === 'number' ? formatMoney(value, FORMS_CURRENCY) : '';
  const label = (v: unknown): string => options?.find(o => o.value === String(v))?.label ?? String(v);
  if (Array.isArray(value)) return value.map(label).join(', ');
  // Every other field type is validated as a string.
  if (typeof value !== 'string' || value === '') return '';
  return field.type === 'dropdown' ? label(value) : value;
}
