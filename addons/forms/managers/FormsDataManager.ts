
import path from 'path';
import { promises as fsp } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { isAtLeast } from '../../../dist/src/utils/version.js';
import { actorOf, type ActorContext } from '../../../dist/src/context/ActorContext.js';
import { systemContext } from '../../../dist/src/context/bootActions.js';
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
  // A form an add-on provides (#1973): the add-on, and its version that wrote
  // this copy. Set only by registerShippedForm; such a form is read-only here.
  providedBy:      z.object({ addon: z.string(), version: z.string() }).optional()
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
  // The providedBy version of the form it was submitted on (#1973); none for a site-built form
  formVersion:   z.string().optional(),
  status:        z.enum(['pending', 'processed', 'rejected']).default('pending'),
  handlerResult: z.unknown().optional(),
  notes:         z.string().optional()
});

/**
 * What `registerShippedForm` did with an add-on's form (#1973):
 *  - `saved`: there was no copy on this site, so it was written.
 *  - `replaced`: the installed add-on is newer than the version that wrote the
 *    copy, or the copy names no version (saved before #1973); it was rewritten.
 *  - `unchanged`: this same version wrote the copy; nothing was written.
 *  - `refused`: the installed add-on is older than the version that wrote the
 *    copy, or another add-on provides the form; the copy is kept.
 */
export type ShippedFormResult = 'saved' | 'replaced' | 'unchanged' | 'refused';

/**
 * A form an add-on provides cannot be saved, renamed or deleted on the site
 * (#1973): its add-on updates it.
 */
export class ProvidedFormError extends Error {
  readonly formId: string;
  constructor(form: { id: string; title?: string; providedBy?: { addon: string; version: string } }) {
    const by = form.providedBy ? `${form.providedBy.addon} ${form.providedBy.version}` : 'an add-on';
    super(`The form "${form.title ?? form.id}" (${form.id}) is provided by ${by}, which updates it, so it cannot be changed here.`);
    this.name = 'ProvidedFormError';
    this.formId = form.id;
  }
}

/** A request subject or a job context: both name who acts. */
function isActorContext(ctx: unknown): ctx is ActorContext {
  return typeof ctx === 'object' && ctx !== null && typeof (ctx as { username?: unknown }).username === 'string';
}

/** Whether a version is x.y.z, the form core's version checks read (`isAtLeast`). */
function isVersion(value: string): boolean {
  try {
    return isAtLeast(value, value);
  } catch {
    return false;
  }
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
   * Write a definition built on this site: the form builder's door. A form an
   * add-on provides is refused (#1973), whether the save would change, rename
   * or overwrite it, and a definition cannot claim `providedBy` this way.
   *
   * @param form - The definition to write
   * @param ctx - Who is saving it
   * @throws {ProvidedFormError} When the stored form, or the definition, is an add-on's
   */
  async saveDefinition(form: FormDefinition, ctx: ActorContext): Promise<void> {
    const live = this.definitions.get(form.id);
    if (live?.providedBy) throw new ProvidedFormError(live);
    if (form.providedBy) throw new ProvidedFormError(form);
    await this.writeDefinition(form);
    console.info(`[FormsDataManager] form '${form.id}' saved by ${actorOf(ctx).user}`);
  }

  /**
   * Register a form an add-on provides (#1973). Call it from the add-on's
   * `register()` at every start, with the definition as this release ships it.
   * The stored copy carries `providedBy: { addon, version }`, `version` being
   * the installed add-on's package.json version, and the add-on's form wins:
   *
   * - No copy on this site: it is written.
   * - The installed add-on is newer than `providedBy.version`, or the copy has
   *   no `providedBy` (saved before #1973): it is replaced. Nothing compares
   *   the copy for edits; a form an add-on provides is read-only on the site.
   * - The same version: nothing is written.
   * - The installed add-on is older: the copy is kept, with an error in the
   *   log and a notice to administrators naming the form and both versions.
   *
   * Throws when the definition does not parse, or the add-on's version is
   * unknown or not x.y.z, so an add-on author sees it at the first start.
   *
   * @param addon - The add-on's slug
   * @param definition - The definition the add-on ships; keys with a default
   *   (`store`, `notify`, ...) may be left out
   * @param ctx - Who is registering it: the add-on's boot context, `systemContext(engine, reason)`
   * @returns What was done with the site's copy
   */
  async registerShippedForm(addon: string, definition: z.input<typeof FormDefinitionSchema>, ctx: ActorContext): Promise<ShippedFormResult> {
    if (!isActorContext(ctx)) {
      // An add-on built before #1973 passes no context, or the old options object.
      console.warn(`[FormsDataManager] ${addon} registered a form without a context; pass systemContext(engine, reason) as the third argument`);
      ctx = systemContext(this.engine, `${addon}: register a form it provides`);
    }
    const { providedBy: _ignored, ...parsed } = FormDefinitionSchema.parse(definition);
    const version = this.addonVersion(addon);
    const stored: FormDefinition = { ...parsed, providedBy: { addon, version } };
    const who = actorOf(ctx).user;

    const live = this.definitions.get(parsed.id);
    if (live?.providedBy && live.providedBy.addon !== addon) {
      console.error(`[FormsDataManager] form '${parsed.id}' not registered for ${addon}: ${live.providedBy.addon} provides it`);
      return 'refused';
    }
    const was = live?.providedBy?.version;
    // A stored version that is not x.y.z cannot be compared; the add-on's form wins.
    if (live && was !== undefined && isVersion(was) && isAtLeast(was, version)) {
      if (isAtLeast(version, was)) return 'unchanged';
      await this.noticeOlder(addon, live, was, version);
      return 'refused';
    }
    await this.writeDefinition(stored);
    const how = !live ? 'saved' : was === undefined ? 'replaced (the copy named no version)' : `replaced (was ${was})`;
    console.info(`[FormsDataManager] form '${parsed.id}' from ${addon} ${version} ${how}, by ${who}`);
    return live ? 'replaced' : 'saved';
  }

  /** The installed add-on's version, from core's add-on registry; throws when it is unknown or not x.y.z. */
  private addonVersion(addon: string): string {
    const addons = this.engine?.getManager('AddonsManager') as { getAddonVersion?(slug: string): string | undefined } | null | undefined;
    const version = addons?.getAddonVersion?.(addon);
    if (!version) throw new Error(`registerShippedForm: no installed add-on '${addon}', so its version is unknown`);
    if (!isVersion(version)) throw new Error(`registerShippedForm: ${addon}'s version '${version}' is not x.y.z`);
    return version;
  }

  /**
   * An add-on older than the one that wrote a form's copy (#1973): the copy is
   * kept, an error is logged, and administrators (whoever holds `admin-system`)
   * are told, at each start until the add-on is upgraded. Never throws: a
   * notice that cannot be sent is logged.
   */
  private async noticeOlder(addon: string, live: FormDefinition, stored: string, installed: string): Promise<void> {
    const name = `"${live.title}" (${live.id})`;
    const title = `Form ${name} not updated: ${addon} ${installed} is older than ${stored}`;
    const message = `The form ${name} on this site was written by ${addon} ${stored}. The installed ${addon} is ${installed}, an older version, so the form is kept as ${stored} wrote it. Install ${addon} ${stored} or later to update it.`;
    console.error(`[FormsDataManager] ${title}. ${message}`);
    try {
      const notifications = this.engine?.getManager('NotificationManager') as {
        createNotification(n: { type: string; level: string; title: string; message: string; targetUsers: string[] }): Promise<unknown>;
      } | null | undefined;
      if (!notifications) return;
      // An empty target list means every user, so nobody to tell is log-only.
      const admins = (await administratorUsernames(this.engine)) ?? [];
      if (admins.length === 0) {
        console.error(`[FormsDataManager] no user holds admin-system; '${live.id}' reported in the log only`);
        return;
      }
      await notifications.createNotification({ type: 'system', level: 'warning', title, message, targetUsers: admins });
    } catch (err) {
      console.error(`[FormsDataManager] could not notify administrators about form '${live.id}':`, (err as Error).message);
    }
  }

  private async writeDefinition(form: FormDefinition): Promise<void> {
    const filePath = path.join(this.dataPath, 'definitions', `${form.id}.json`);
    const tmp = `${filePath}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(form, null, 2), 'utf8');
    await fsp.rename(tmp, filePath);
    this.definitions.set(form.id, form);
  }

  /**
   * Delete a definition built on this site. A form an add-on provides is
   * refused (#1973).
   *
   * @param formId - The form to delete
   * @param ctx - Who is deleting it
   * @returns False when there is no such form
   * @throws {ProvidedFormError} When an add-on provides the form
   */
  async deleteDefinition(formId: string, ctx: ActorContext): Promise<boolean> {
    const live = this.definitions.get(formId);
    if (live?.providedBy) throw new ProvidedFormError(live);
    const filePath = path.join(this.dataPath, 'definitions', `${formId}.json`);
    try {
      await fsp.unlink(filePath);
      this.definitions.delete(formId);
      console.info(`[FormsDataManager] form '${formId}' deleted by ${actorOf(ctx).user}`);
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
