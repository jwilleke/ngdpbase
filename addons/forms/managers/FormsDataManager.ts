
import path from 'path';
import { promises as fsp } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { evaluateSeededAddonPage, pageSourceHash } from '../../../dist/src/utils/addonPageSync.js';
import type { SeededAddonPageStatus } from '../../../dist/src/utils/addonPageSync.js';
import { applyDirectoryPartAtStart, backupDirectoryPart, stageDirectoryPart } from '../../../dist/src/utils/directoryBackup.js';
import type { BackupData, ManagerBackupOptions, ManagerRestoreOptions } from '../../../dist/src/managers/BaseManager.js';
import { administratorUsernames } from '../../../dist/src/utils/administrators.js';

// ── Zod schemas ───────────────────────────────────────────────────────────────

const BaseFieldSchema = z.object({
  name:          z.string(),
  type:          z.enum(['text', 'email', 'tel', 'textarea', 'date', 'time', 'dropdown', 'checkbox', 'hidden', 'section', 'amount', 'checklist', 'lines']),
  label:         z.string(),
  required:      z.boolean().default(false),
  description:   z.string().optional(),
  placeholder:   z.string().optional(),
  optionsSource: z.string().optional(),
  options:       z.array(z.string()).optional(),
  prefill:       z.string().optional(),
  // checklist, lines: the amount field whose value the sum is shown against (#1904, #1913)
  totalField:    z.string().optional()
});

/**
 * Types a `lines` row cannot hold (#1913): a row is one value per sub-field,
 * so no nested lines, no grouping, nothing hidden, no list of values.
 */
const NOT_IN_A_ROW: ReadonlyArray<string> = ['lines', 'section', 'hidden', 'checklist'];

/** One sub-field of a `lines` row. */
const RowFieldSchema = BaseFieldSchema.refine(f => !NOT_IN_A_ROW.includes(f.type), {
  message: `a lines row cannot hold a field of type ${NOT_IN_A_ROW.join(', ')}`,
  path: ['type']
});

export const FieldSchema = BaseFieldSchema.extend({
  // lines (#1913): the sub-fields of each row, how many rows, and which sub-field is summed
  fields:      z.array(RowFieldSchema).optional(),
  minRows:     z.number().int().min(0).optional(),
  maxRows:     z.number().int().min(1).optional(),
  amountField: z.string().optional()
}).superRefine((field, ctx) => {
  if (field.type !== 'lines') return;
  if (!field.fields?.length) {
    ctx.addIssue({ code: 'custom', path: ['fields'], message: 'a lines field needs its sub-fields' });
  }
  if (field.minRows !== undefined && field.maxRows !== undefined && field.minRows > field.maxRows) {
    ctx.addIssue({ code: 'custom', path: ['minRows'], message: 'minRows cannot be more than maxRows' });
  }
  if (field.amountField !== undefined && !field.fields?.some(f => f.name === field.amountField && f.type === 'amount')) {
    ctx.addIssue({ code: 'custom', path: ['amountField'], message: 'amountField must name an amount sub-field' });
  }
});

export const FormDefinitionSchema = z.object({
  id:              z.string().regex(/^[a-z0-9-]+$/, 'Form id must be lowercase alphanumeric with hyphens'),
  title:           z.string(),
  description:     z.string().optional(),
  handler:         z.string().optional(),
  proxySubmission: z.boolean().default(false),
  notifyRole:      z.string().default('admin'),
  confirmationUrl: z.string().optional(),
  // false: the handler's answer is the record, and no submission file is kept
  store:           z.boolean().default(true),
  // false: no "New form submission" notice and no email of the details (#1954)
  notify:          z.boolean().default(true),
  fields:          z.array(FieldSchema).min(1),
  // A form an add-on ships (#1880): who shipped it, and the hash of the shipped
  // definition this copy was saved or synced from. Not part of the hash itself.
  shipped:         z.object({ addon: z.string(), sourceHash: z.string() }).optional()
});

export type FormField      = z.infer<typeof FieldSchema>;
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;

export const SubmissionSchema = z.object({
  id:          z.string(),
  formId:      z.string(),
  submittedAt: z.string(),
  submittedBy: z.string(),
  onBehalfOf:  z.object({
    name:    z.string().optional(),
    email:   z.string().optional(),
    phone:   z.string().optional(),
    address: z.string().optional()
  }).optional(),
  data:          z.record(z.string(), z.unknown()),
  status:        z.enum(['pending', 'processed', 'rejected']).default('pending'),
  handlerResult: z.unknown().optional(),
  notes:         z.string().optional()
});

/**
 * Where a shipped form's copy on this site stands against what its add-on
 * ships now (#1880). The same rule as shipped pages (#931, #1395), so
 * `status` is that rule's answer: `current`, `outdated` (unedited since it was
 * saved or synced, or unstamped), or `locally-modified` (edited on this site).
 */
export interface ShippedFormState {
  addon: string;
  status: SeededAddonPageStatus;
  /** False for a copy saved before #1880, which carries no stamp. */
  stamped: boolean;
  /**
   * The add-on ships something other than what this copy was saved or synced
   * from, so for an edited copy an update is waiting. True when unstamped.
   */
  shippedChanged: boolean;
  /**
   * The add-on ships a change this copy has not taken: it is outdated, or it
   * was edited here and the add-on has shipped something new since (#1918).
   */
  behind: boolean;
  /** The add-on marked what it ships now as needed to operate (#1918). */
  required: boolean;
}

/** Options for `registerShippedForm` (#1918). */
export interface ShippedFormOptions {
  /**
   * What ships now is needed for the add-on to work. A site copy behind it
   * raises a critical notice to administrators instead of an "update
   * available" one, and the forms admin flags it.
   */
  required?: boolean;
}

/** The notice `registerShippedForm` raises for a copy that is behind (#1918). */
export interface ShippedFormNotice {
  title: string;
  message: string;
  level: 'info' | 'error';
}

/**
 * What administrators are told when a shipped form's copy is behind what its
 * add-on ships (#1918): which add-on, which form, and the fix on the forms
 * admin. Critical ("Critical:" title, error level, as an add-on that did not
 * load is, #1883) when the add-on marked the change required; otherwise an
 * "update available" info notice. An edited copy says Sync will not replace
 * it without Force Sync.
 */
export function shippedFormNotice(addon: string, form: { id: string; title: string }, state: Pick<ShippedFormState, 'status' | 'required'>): ShippedFormNotice {
  const name = `"${form.title}" (${form.id})`;
  const need = state.required ? `${addon} needs this update to work. ` : '';
  const fix = state.status === 'locally-modified'
    ? 'It was edited on this site, so Sync does not replace it: open Forms (/addons/forms) and choose Force Sync to take the shipped version. Your edits to it are lost.'
    : 'Open Forms (/addons/forms) and choose Sync to take it.';
  return {
    title: state.required
      ? `Critical: form ${name} from ${addon} needs syncing`
      : `Form update available: ${name} from ${addon}`,
    message: `${need}${addon} ships a new version of the form ${name}. ${fix}`,
    level: state.required ? 'error' : 'info'
  };
}

/** What `syncShippedForm` did: `edited` means it refused to overwrite site edits. */
export type ShippedFormSyncResult = 'synced' | 'edited' | 'not-shipped';

/**
 * The text a definition's hash is taken over: the parsed definition (defaults
 * applied, keys in schema order) without its `shipped` stamp, so a copy saved
 * by the builder and the add-on's own object compare equal when they say the
 * same thing.
 */
function definitionContent(form: FormDefinition): string {
  const { shipped: _stamp, ...body } = FormDefinitionSchema.parse(form);
  return JSON.stringify(body);
}

export type FormSubmission   = z.infer<typeof SubmissionSchema>;
export type SubmissionStatus = 'pending' | 'processed' | 'rejected';

// ── Validator builder ─────────────────────────────────────────────────────────

/**
 * The currency forms money is shown in: running totals and the submission
 * email. The `amount` field shows "$" and parses two decimals, so forms money
 * is US dollars throughout.
 */
export const FORMS_CURRENCY = 'USD';

/**
 * Parse a typed amount to whole minor units (cents): `1250`, `1,250.5`,
 * `$1,250.50`. Returns null for anything else, including more than two
 * decimals, a sign, or zero.
 */
export function parseAmount(raw: string): number | null {
  const text = raw.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/**
 * Build the submission validator. `choices` holds the options each dropdown
 * offered this viewer (resolved again at submit time); a dropdown value not
 * among them is refused. An amount comes out as whole cents. A `lines`
 * sub-field's choices are keyed `<lines>.<sub-field>` (see resolveChoiceOptions).
 */
export function buildSubmissionValidator(
  form: FormDefinition,
  choices: Map<string, string[]> = new Map()
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z.object(fieldsShape(form.fields, name => choices.get(name)));
}

/** One rule per field that carries data: the form's fields, or a `lines` row's. */
function fieldsShape(
  fields: FormField[],
  choicesFor: (name: string) => string[] | undefined
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    if (field.type === 'hidden' || field.type === 'section') continue;
    shape[field.name] = fieldRule(field, choicesFor);
  }
  return shape;
}

function fieldRule(field: FormField, choicesFor: (name: string) => string[] | undefined): z.ZodTypeAny {
  if (field.type === 'checklist') return checklistRule(field, choicesFor(field.name) ?? []);
  if (field.type === 'lines') return linesRule(field, choicesFor);
  const allowed = choicesFor(field.name);
  let rule: z.ZodTypeAny;
  if (field.type === 'email') {
    rule = z.string().email(`${field.label} must be a valid email`);
  } else if (field.type === 'tel') {
    rule = z.string().min(7, `${field.label} must be at least 7 characters`);
  } else if (field.type === 'checkbox') {
    rule = z.union([z.literal('on'), z.literal('true'), z.literal('1')]);
  } else if (field.type === 'amount') {
    rule = z.string().transform((value, ctx) => {
      const cents = parseAmount(value);
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: `${field.label}: enter an amount such as 125.50` });
        return z.NEVER;
      }
      return cents;
    });
  } else if (field.type === 'dropdown' && allowed) {
    rule = z.string().refine(v => allowed.includes(v), `${field.label}: choose one of the listed options`);
  } else {
    rule = field.required
      ? z.string().min(1, `${field.label} is required`)
      : z.string();
  }
  if (!field.required) rule = z.literal('').or(rule.optional());
  return rule;
}

/** A row whose every value is empty: what an untouched "+ Add line" sends. */
function isEmptyRow(row: unknown): boolean {
  return typeof row === 'object' && row !== null && !Array.isArray(row)
    && Object.values(row).every(v => v === '' || v === null || v === undefined);
}

/**
 * A `lines` field submits an array of row objects (#1913). Fully empty rows
 * at the end are dropped; each remaining row gets its sub-fields' rules, the
 * same rules as top-level fields, so an issue's path is `[lines, i, field]`.
 * `required` means at least one row; `minRows`/`maxRows` bound the count.
 */
function linesRule(field: FormField, choicesFor: (name: string) => string[] | undefined): z.ZodTypeAny {
  const row = z.object(fieldsShape(field.fields ?? [], sub => choicesFor(`${field.name}.${sub}`)));
  const minRows = field.minRows ?? 0;
  const { maxRows } = field;
  const dropTrailingEmpty = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value;
    const rows: unknown[] = [...(value as unknown[])];
    while (rows.length > 0 && isEmptyRow(rows[rows.length - 1])) rows.pop();
    return rows;
  };
  return z.preprocess(dropTrailingEmpty, z.array(row, { error: `${field.label}: send the lines as a list` }))
    .optional()
    .transform(rows => rows ?? [])
    .refine(rows => !field.required || rows.length > 0, `${field.label}: add at least one line`)
    .refine(rows => rows.length >= minRows, `${field.label}: add at least ${minRows} lines`)
    .refine(rows => maxRows === undefined || rows.length <= maxRows, `${field.label}: no more than ${maxRows} lines`);
}

/**
 * A checklist submits the ticked values as an array (#1904). Each must be one
 * of the choices it offered this viewer; `required` means at least one.
 * A value ticked twice counts once.
 */
function checklistRule(field: FormField, allowed: string[]): z.ZodTypeAny {
  return z.array(z.string(), { error: `${field.label}: tick from the listed options` })
    .optional()
    .transform(values => [...new Set(values ?? [])])
    .refine(values => values.every(v => allowed.includes(v)), `${field.label}: tick only the listed options`)
    .refine(values => !field.required || values.length > 0, `${field.label}: tick at least one`);
}

/**
 * Flatten validation issues to one message per field, for showing next to it.
 * A `lines` row's sub-field is keyed `lines[<0-based row>].<field>` (#1913),
 * the key a handler returns in `fields` too.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const [first, row, sub] = issue.path;
    const name = typeof row === 'number' && typeof sub === 'string'
      ? `${String(first)}[${row}].${sub}`
      : String(first ?? '');
    if (name && !(name in out)) out[name] = issue.message;
  }
  return out;
}

// ── FormsDataManager ──────────────────────────────────────────────────────────

export default class FormsDataManager {
  private dataPath: string;
  private definitions: Map<string, FormDefinition> = new Map();
  /** Forms add-ons registered this boot, by id (#1880). */
  private shippedForms: Map<string, { addon: string; definition: FormDefinition; required: boolean }> = new Map();
  private engine: { getManager: (name: string) => unknown } | null;

  constructor(engine: unknown, dataPath: string) {
    this.engine = (engine ?? null) as { getManager: (name: string) => unknown } | null;
    this.dataPath = dataPath;
  }

  async initialize(): Promise<void> {
    // #1876: a staged site restore puts the backed-up forms folder in place before it is read.
    const configManager = this.engine?.getManager?.('ConfigurationManager') as { getResolvedDataPath(key: string, def: string): string } | null | undefined;
    if (configManager) applyDirectoryPartAtStart('FormsDataManager', this.dataPath, configManager);
    await fsp.mkdir(path.join(this.dataPath, 'definitions'), { recursive: true });
    await fsp.mkdir(path.join(this.dataPath, 'submissions'), { recursive: true });
    await this.loadDefinitions();
  }

  private async loadDefinitions(): Promise<void> {
    const defsDir = path.join(this.dataPath, 'definitions');
    let files: string[];
    try {
      files = (await fsp.readdir(defsDir)).filter(f => f.endsWith('.json'));
    } catch {
      return;
    }

    for (const file of files) {
      try {
        const raw = await fsp.readFile(path.join(defsDir, file), 'utf8');
        const json: unknown = JSON.parse(raw);
        const result = FormDefinitionSchema.safeParse(json);
        if (!result.success) {
          console.warn(`[FormsDataManager] Invalid form definition ${file}:`, result.error.format());
          continue;
        }
        this.definitions.set(result.data.id, result.data);
      } catch (err) {
        console.warn(`[FormsDataManager] Failed to load definition ${file}:`, (err as Error).message);
      }
    }
    console.info(`[FormsDataManager] Loaded ${this.definitions.size} form definition(s)`);
  }

  getDefinition(formId: string): FormDefinition | undefined {
    return this.definitions.get(formId);
  }

  getAllDefinitions(): FormDefinition[] {
    return Array.from(this.definitions.values());
  }

  async saveSubmission(submission: Omit<FormSubmission, 'id'> & { id?: string }): Promise<FormSubmission> {
    const full: FormSubmission = {
      ...submission,
      id: submission.id ?? uuidv4(),
      status: submission.status ?? 'pending'
    };

    const dir = path.join(this.dataPath, 'submissions', full.formId);
    await fsp.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, `${full.id}.json`);
    const tmp = `${filePath}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(full, null, 2), 'utf8');
    await fsp.rename(tmp, filePath);
    return full;
  }

  async getSubmissions(formId?: string): Promise<FormSubmission[]> {
    const subsDir = path.join(this.dataPath, 'submissions');
    const submissions: FormSubmission[] = [];

    try {
      const formDirs = formId
        ? [formId]
        : await fsp.readdir(subsDir);

      for (const fid of formDirs) {
        const dir = path.join(subsDir, fid);
        try {
          const stat = await fsp.stat(dir);
          if (!stat.isDirectory()) continue;
          const files = (await fsp.readdir(dir)).filter(f => f.endsWith('.json'));
          for (const file of files) {
            try {
              const raw = await fsp.readFile(path.join(dir, file), 'utf8');
              const parsed = JSON.parse(raw) as FormSubmission;
              submissions.push(parsed);
            } catch { /* skip corrupt files */ }
          }
        } catch { /* skip missing dirs */ }
      }
    } catch { /* no submissions dir yet */ }

    return submissions.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async updateStatus(submissionId: string, formId: string, status: SubmissionStatus, notes?: string): Promise<boolean> {
    const filePath = path.join(this.dataPath, 'submissions', formId, `${submissionId}.json`);
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const submission = JSON.parse(raw) as FormSubmission;
      submission.status = status;
      if (notes !== undefined) submission.notes = notes;
      const tmp = `${filePath}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(submission, null, 2), 'utf8');
      await fsp.rename(tmp, filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getSubmissionCount(formId: string): Promise<number> {
    const dir = path.join(this.dataPath, 'submissions', formId);
    try {
      const files = await fsp.readdir(dir);
      return files.filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  /**
   * Write a definition. A copy of a shipped form keeps its `shipped` stamp
   * when the definition saved carries none (a form-builder save), so the edit
   * shows as an edit (#1880).
   */
  async saveDefinition(form: FormDefinition): Promise<void> {
    const shipped = form.shipped ?? this.definitions.get(form.id)?.shipped;
    const stored: FormDefinition = shipped ? { ...form, shipped } : form;
    const filePath = path.join(this.dataPath, 'definitions', `${form.id}.json`);
    const tmp = `${filePath}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(stored, null, 2), 'utf8');
    await fsp.rename(tmp, filePath);
    this.definitions.set(form.id, stored);
  }

  /**
   * Register a form an add-on ships (#1880). Call it from the add-on's
   * `register()` at every start, with the definition as the add-on ships it now.
   *
   * - No copy on this site: it is saved, stamped with the hash of what was saved.
   * - A copy with no stamp (saved before #1880) that says the same as the
   *   definition: stamped, as shipped pages are (#1408).
   * - Anything else is left as it is. The forms admin shows an outdated copy
   *   with Sync, and an edited copy as edited; nothing here overwrites it.
   *
   * A copy left behind what ships raises an administrator notice, once per
   * form and shipped version (#1918): critical with `required`, otherwise
   * "update available".
   *
   * Throws when the definition does not parse, so an add-on author sees it at
   * the first start.
   *
   * @param addon - The add-on's name, shown in the forms admin
   * @param definition - The definition the add-on ships; keys with a default
   *   (`store`, `notify`, ...) may be left out
   * @param options - `required`: what ships now is needed for the add-on to work
   * @returns Where the site's copy stands after registering
   */
  async registerShippedForm(addon: string, definition: z.input<typeof FormDefinitionSchema>, options: ShippedFormOptions = {}): Promise<ShippedFormState> {
    const { shipped: _ignored, ...parsed } = FormDefinitionSchema.parse(definition);
    this.shippedForms.set(parsed.id, { addon, definition: parsed, required: options.required === true });

    const live = this.definitions.get(parsed.id);
    if (!live) {
      await this.writeShipped(addon, parsed);
    } else if (!live.shipped && definitionContent(live) === definitionContent(parsed)) {
      await this.saveDefinition({ ...live, shipped: { addon, sourceHash: pageSourceHash(definitionContent(parsed)) } });
    }

    const state = this.shippedFormState(parsed.id)!;
    if (state.behind) await this.noticeBehind(addon, parsed, state);
    return state;
  }

  /**
   * Tell administrators a shipped form's copy is behind (#1918), once per form
   * and shipped version: the version told about is kept in
   * `shipped-notices.json` beside the definitions, so a restart, or the
   * notice being dismissed or cleared, does not raise it again; the next
   * shipped change does. Never throws: a notice that cannot be sent is
   * logged, and tried again at the next start.
   */
  private async noticeBehind(addon: string, definition: FormDefinition, state: ShippedFormState): Promise<void> {
    const notice = shippedFormNotice(addon, definition, state);
    const log = state.required ? console.error : console.info;
    log(`[FormsDataManager] ${notice.title}: ${notice.message}`);

    const sourceHash = pageSourceHash(definitionContent(definition));
    const file = path.join(this.dataPath, 'shipped-notices.json');
    try {
      let told: Record<string, string> = {};
      try {
        told = JSON.parse(await fsp.readFile(file, 'utf8')) as Record<string, string>;
      } catch { /* none told yet */ }
      if (told[definition.id] === sourceHash) return;

      const notifications = this.engine?.getManager('NotificationManager') as {
        createNotification(n: { type: string; level: string; title: string; message: string; targetUsers: string[] }): Promise<unknown>;
      } | null | undefined;
      if (!notifications) return;
      // An empty target list means every user, so nobody to tell is log-only.
      const admins = (await administratorUsernames(this.engine)) ?? [];
      if (admins.length === 0) {
        console.error(`[FormsDataManager] no user holds admin-system; '${definition.id}' reported in the log only`);
        return;
      }
      await notifications.createNotification({ type: 'system', level: notice.level, title: notice.title, message: notice.message, targetUsers: admins });

      told[definition.id] = sourceHash;
      const tmp = `${file}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(told, null, 2), 'utf8');
      await fsp.rename(tmp, file);
    } catch (err) {
      console.error(`[FormsDataManager] could not notify administrators about form '${definition.id}':`, (err as Error).message);
    }
  }

  /**
   * Where a shipped form's copy stands, or undefined for a form no add-on
   * registered this boot, or one with no copy on this site.
   */
  shippedFormState(formId: string): ShippedFormState | undefined {
    const shipped = this.shippedForms.get(formId);
    const live = this.definitions.get(formId);
    if (!shipped || !live) return undefined;
    const storedHash = live.shipped?.sourceHash;
    const sourceContent = definitionContent(shipped.definition);
    const stamped = typeof storedHash === 'string' && storedHash.length > 0;
    const status = evaluateSeededAddonPage({ sourceContent, liveContent: definitionContent(live), storedHash });
    const shippedChanged = !stamped || storedHash !== pageSourceHash(sourceContent);
    return {
      addon: shipped.addon,
      status,
      stamped,
      shippedChanged,
      behind: status !== 'current' && shippedChanged,
      required: shipped.required
    };
  }

  /**
   * Replace the site's copy of a shipped form with what the add-on ships now.
   * A copy edited on this site is replaced only with `overwriteEdited`, which
   * the forms admin sends after the admin confirms.
   */
  async syncShippedForm(formId: string, options: { overwriteEdited?: boolean } = {}): Promise<ShippedFormSyncResult> {
    const shipped = this.shippedForms.get(formId);
    if (!shipped) return 'not-shipped';
    if (this.shippedFormState(formId)?.status === 'locally-modified' && !options.overwriteEdited) return 'edited';
    await this.writeShipped(shipped.addon, shipped.definition);
    return 'synced';
  }

  private async writeShipped(addon: string, definition: FormDefinition): Promise<void> {
    await this.saveDefinition({ ...definition, shipped: { addon, sourceHash: pageSourceHash(definitionContent(definition)) } });
  }

  async deleteDefinition(formId: string): Promise<boolean> {
    const filePath = path.join(this.dataPath, 'definitions', `${formId}.json`);
    try {
      await fsp.unlink(filePath);
      this.definitions.delete(formId);
      return true;
    } catch {
      return false;
    }
  }

  async reloadDefinition(formId: string): Promise<FormDefinition | undefined> {
    const filePath = path.join(this.dataPath, 'definitions', `${formId}.json`);
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      const json: unknown = JSON.parse(raw);
      const result = FormDefinitionSchema.safeParse(json);
      if (!result.success) {
        console.warn(`[FormsDataManager] Invalid form definition ${formId}.json:`, result.error.format());
        return undefined;
      }
      this.definitions.set(result.data.id, result.data);
      return result.data;
    } catch {
      return undefined;
    }
  }

  // ── Backup (#1876) ──────────────────────────────────────────────────────────

  /** The forms folder — definitions and submissions — as `<stem>.forms.tar` beside the backup document (`.tar.enc` under the backup key). */
  async backup(options?: ManagerBackupOptions): Promise<BackupData> {
    return backupDirectoryPart('FormsDataManager', 'forms', this.dataPath, options);
  }

  /** Staged for the next start with the rest of a site restore; the live folder is untouched until then. */
  async restore(backupData: BackupData, options?: ManagerRestoreOptions): Promise<void> {
    await stageDirectoryPart('FormsDataManager', this.dataPath, backupData, options);
  }

  restoreIsStaged(): boolean {
    return true;
  }
}
