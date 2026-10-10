
/**
 * The choices a dropdown offers one viewer, resolved the same way when the
 * form is drawn and when it is submitted (the submit refuses a value that is
 * not among them).
 *
 *   options: ["A", "B"]                                    — fixed in the definition
 *   optionsSource: "config:my.config.key"                  — a list in site config
 *   optionsSource: "fetch:LedgerManager.toFormOptions(list=funds)"
 *                                                          — a manager, asked with the viewer's context
 */

import { resolveManagerOptions, type FormOption } from '../../../dist/src/utils/pluginFormatters.js';
import type { FormField } from './FormsDataManager.js';

interface EngineLike {
  getManager<T = unknown>(name: string): T | null | undefined;
}

export async function resolveFieldOptions(
  engine: EngineLike,
  field: FormField,
  userContext: unknown
): Promise<FormOption[]> {
  const source = field.optionsSource ?? '';
  if (source.startsWith('config:')) {
    const cm = engine.getManager<{ getProperty(key: string, fallback: unknown): unknown }>('ConfigurationManager');
    const list = cm?.getProperty(source.slice('config:'.length), []);
    return Array.isArray(list) ? list.filter((o): o is string => typeof o === 'string').map(o => ({ value: o, label: o })) : [];
  }
  if (source.startsWith('fetch:')) {
    const result = await resolveManagerOptions(source.slice('fetch:'.length), { engine, userContext });
    return result.status === 'ok' ? result.options : [];
  }
  return (field.options ?? []).map(o => ({ value: o, label: o }));
}

/** Every dropdown's allowed values, keyed by field name. */
export async function resolveChoices(
  engine: EngineLike,
  fields: FormField[],
  userContext: unknown
): Promise<Map<string, string[]>> {
  const choices = new Map<string, string[]>();
  for (const field of fields) {
    if (field.type !== 'dropdown') continue;
    const options = await resolveFieldOptions(engine, field, userContext);
    choices.set(field.name, options.map(o => o.value));
  }
  return choices;
}
