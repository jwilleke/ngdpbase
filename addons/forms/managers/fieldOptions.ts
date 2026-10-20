
/**
 * The choices a dropdown or checklist offers one viewer, resolved the same way when the
 * form is drawn and when it is submitted (the submit refuses a value that is
 * not among them).
 *
 *   options: ["A", "B"]                                    — fixed in the definition
 *   optionsSource: "config:my.config.key"                  — a list in site config
 *   optionsSource: "fetch:LedgerManager.toFormOptions(list=funds)"
 *                                                          — a manager, asked with the viewer's context
 */

import type { FormOption } from '../../../dist/src/utils/pluginFormatters.js';
import type PluginManager from '../../../dist/src/managers/PluginManager.js';
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
    // #1820: the fetch convention is PluginManager's.
    const pluginManager = engine.getManager<PluginManager>('PluginManager');
    if (!pluginManager) throw new Error('forms: PluginManager is not available to resolve "fetch:" options');
    const result = await pluginManager.formatters.resolveManagerOptions(source.slice('fetch:'.length), { engine, userContext });
    return result.status === 'ok' ? result.options : [];
  }
  return (field.options ?? []).map(o => ({ value: o, label: o }));
}

/**
 * Every dropdown's and checklist's choices for this viewer, keyed by field
 * name. A dropdown inside a `lines` row is keyed `<lines>.<sub-field>`,
 * resolved once for all its rows (#1913).
 */
export async function resolveChoiceOptions(
  engine: EngineLike,
  fields: FormField[],
  userContext: unknown
): Promise<Map<string, FormOption[]>> {
  const choices = new Map<string, FormOption[]>();
  const keyed = fields.flatMap((field): Array<[string, FormField]> => field.type === 'lines'
    ? (field.fields ?? []).map((sub): [string, FormField] => [`${field.name}.${sub.name}`, sub])
    : [[field.name, field]]);
  for (const [key, field] of keyed) {
    if (field.type !== 'dropdown' && field.type !== 'checklist') continue;
    choices.set(key, await resolveFieldOptions(engine, field, userContext));
  }
  return choices;
}

/** The allowed values of each resolved choice list, as the submission validator takes them. */
export function choiceValues(options: Map<string, FormOption[]>): Map<string, string[]> {
  return new Map(Array.from(options, ([key, list]) => [key, list.map(o => o.value)]));
}
