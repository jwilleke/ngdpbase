
/**
 * FormsPlugin — renders a form inline in a wiki page.
 *
 * Usage:
 *   [{Form id='clubhouse-reservation'}]
 */

import path from 'path';
import { promises as fsp } from 'fs';
import type { PluginContext, PluginParams, PluginFormatters } from '../../../dist/src/managers/PluginManager.js';
import type ConfigurationManager from '../../../dist/src/managers/ConfigurationManager.js';
import type { FormOption } from '../../../dist/src/utils/pluginFormatters.js';
import type FormsDataManager from '../managers/FormsDataManager.js';
import type { FormDefinition, FormField } from '../managers/FormsDataManager.js';
import { FORMS_CURRENCY } from '../managers/FormsDataManager.js';
import { resolveFieldOptions } from '../managers/fieldOptions.js';

type ResolvedField = FormField & { resolvedOptions?: FormOption[]; prefillValue?: string; resolvedFields?: ResolvedField[] };

function resolvePrefill(
  dotPath: string,
  userCtx: Record<string, unknown>,
  unitRecord: Record<string, unknown> | undefined
): string {
  if (!dotPath.startsWith('user.')) return '';
  const sub = dotPath.slice(5);
  if (sub.startsWith('unit.')) {
    if (!unitRecord) return '';
    const unitField = sub.slice(5);
    const val = unitRecord[unitField];
    return typeof val === 'string' ? val : '';
  }
  const val = userCtx[sub];
  return typeof val === 'string' ? val : '';
}

function renderField(f: PluginFormatters, field: ResolvedField): string {
  const { escapeHtml: escHtml } = f;
  const required = field.required ? ' required' : '';
  const placeholder = field.placeholder ? ` placeholder="${escHtml(field.placeholder)}"` : '';
  const desc = field.description
    ? `<div class="form-text text-muted">${escHtml(field.description)}</div>`
    : '';
  const requiredBadge = field.required ? ' <span class="text-danger">*</span>' : '';
  const pv = field.prefillValue ?? '';
  // The submit answers one message per field; forms-submit.js puts it here.
  const errorSlot = `<div class="invalid-feedback d-block" data-field-error="${escHtml(field.name)}"></div>`;

  let control: string;

  if (field.type === 'textarea') {
    control = `<textarea name="${escHtml(field.name)}" class="form-control"${placeholder}${required} rows="4">${escHtml(pv)}</textarea>`;
  } else if (field.type === 'dropdown') {
    const opts = (field.resolvedOptions ?? [])
      .map(o => {
        const sel = pv && o.value === pv ? ' selected' : '';
        return `<option value="${escHtml(o.value)}"${sel}>${escHtml(o.label)}</option>`;
      })
      .join('');
    control = `<select name="${escHtml(field.name)}" id="field-${escHtml(field.name)}" class="form-select"${required}><option value="">— select —</option>${opts}</select>`;
  } else if (field.type === 'amount') {
    // Text, not type=number: people type "$1,250.50", and the server converts it to cents.
    const valueAttr = pv ? ` value="${escHtml(pv)}"` : '';
    control = `<div class="input-group">
      <span class="input-group-text">$</span>
      <input type="text" inputmode="decimal" autocomplete="off" name="${escHtml(field.name)}" id="field-${escHtml(field.name)}" class="form-control"${placeholder}${required}${valueAttr}>
    </div>`;
  } else if (field.type === 'checklist') {
    return renderChecklist(f, field, requiredBadge, desc, errorSlot);
  } else if (field.type === 'lines') {
    return renderLines(f, field, requiredBadge, desc, errorSlot);
  } else if (field.type === 'checkbox') {
    return `<div class="mb-3 form-check">
      <input type="checkbox" name="${escHtml(field.name)}" id="field-${escHtml(field.name)}" class="form-check-input"${required}>
      <label class="form-check-label" for="field-${escHtml(field.name)}">${escHtml(field.label)}${requiredBadge}</label>
      ${desc}
      ${errorSlot}
    </div>`;
  } else if (field.type === 'hidden') {
    return `<input type="hidden" name="${escHtml(field.name)}">`;
  } else {
    const valueAttr = pv ? ` value="${escHtml(pv)}"` : '';
    control = `<input type="${escHtml(field.type)}" name="${escHtml(field.name)}" id="field-${escHtml(field.name)}" class="form-control"${placeholder}${required}${valueAttr}>`;
  }

  return `<div class="mb-3">
    <label class="form-label" for="field-${escHtml(field.name)}">${escHtml(field.label)}${requiredBadge}</label>
    ${control}
    ${desc}
    ${errorSlot}
  </div>`;
}

/**
 * A checklist (#1904): one checkbox per choice, submitted as an array by
 * forms-submit.js. When any choice carries an amount, a line shows how many
 * are ticked and their sum; with `totalField`, whether the sum matches what
 * was typed in that field. forms-submit.js keeps both lines current.
 */
function renderChecklist(f: PluginFormatters, field: ResolvedField, requiredBadge: string, desc: string, errorSlot: string): string {
  const { escapeHtml: escHtml } = f;
  const name = escHtml(field.name);
  const options = field.resolvedOptions ?? [];
  const boxes = options.length === 0
    ? '<div class="text-muted fst-italic" data-checklist-empty>Nothing to choose</div>'
    : options.map((o, i) => {
      const id = `field-${name}-${i}`;
      const amount = typeof o.amount === 'number' ? ` data-amount="${o.amount}"` : '';
      return `<div class="form-check">
        <input type="checkbox" name="${name}" value="${escHtml(o.value)}" id="${id}" class="form-check-input"${amount}>
        <label class="form-check-label" for="${id}">${escHtml(o.label)}</label>
      </div>`;
    }).join('\n');
  const hasAmounts = options.some(o => typeof o.amount === 'number');
  const total = hasAmounts ? renderTotal(f, 'checklist', 'Ticked', Boolean(field.totalField)) : '';
  const attrs = [
    `data-checklist="${name}"`,
    `data-label="${escHtml(field.label)}"`,
    field.required ? 'data-required="1"' : '',
    hasAmounts ? `data-currency="${FORMS_CURRENCY}"` : '',
    hasAmounts && field.totalField ? `data-total-field="${escHtml(field.totalField)}"` : ''
  ].filter(Boolean).join(' ');
  return `<fieldset class="mb-3" ${attrs}>
    <legend class="form-label fs-6 mb-1">${escHtml(field.label)}${requiredBadge}</legend>
    ${boxes}
    ${total}
    ${desc}
    ${errorSlot}
  </fieldset>`;
}

/**
 * The running-total line a checklist or lines field shows, "<prefix>: N · $sum",
 * and with `totalField` the line saying whether the sum matches it.
 * forms-submit.js keeps both current (drawTotal).
 */
function renderTotal(f: PluginFormatters, kind: 'checklist' | 'lines', prefix: string, withMatch: boolean): string {
  const total = `<div class="form-text" data-${kind}-total>${prefix}: 0 · ${f.escapeHtml(f.formatMoney(0, FORMS_CURRENCY))}</div>`;
  return withMatch ? `${total}\n    <div class="form-text" data-${kind}-match></div>` : total;
}

/**
 * Lines (#1913): repeating rows of the field's sub-fields, each named
 * `<lines>[<row>].<sub-field>`, the key its error comes back under.
 * max(1, minRows) rows are drawn; forms-submit.js adds rows up to maxRows,
 * removes them down to that floor, renumbers, and submits an array of rows.
 */
function renderLines(f: PluginFormatters, field: ResolvedField, requiredBadge: string, desc: string, errorSlot: string): string {
  const { escapeHtml: escHtml } = f;
  const subs = field.resolvedFields ?? [];
  const floor = Math.max(1, field.minRows ?? 0);
  const row = (i: number): string => {
    const cells = subs
      .map(sub => `<div class="col-md">${renderField(f, { ...sub, name: `${field.name}[${i}].${sub.name}` })}</div>`)
      .join('\n');
    return `<div class="border rounded p-2 mb-2" data-lines-row>
      <div class="row g-2 align-items-start">
        ${cells}
        <div class="col-md-auto"><button type="button" class="btn btn-sm btn-outline-danger" data-lines-remove disabled>Remove</button></div>
      </div>
    </div>`;
  };
  const rows = Array.from({ length: floor }, (_, i) => row(i)).join('\n');
  const atMax = field.maxRows !== undefined && floor >= field.maxRows;
  const total = field.amountField ? renderTotal(f, 'lines', 'Lines', Boolean(field.totalField)) : '';
  const attrs = [
    `data-lines="${escHtml(field.name)}"`,
    `data-label="${escHtml(field.label)}"`,
    field.required ? 'data-required="1"' : '',
    `data-min-rows="${field.minRows ?? 0}"`,
    field.maxRows !== undefined ? `data-max-rows="${field.maxRows}"` : '',
    field.amountField ? `data-amount-field="${escHtml(field.amountField)}" data-currency="${FORMS_CURRENCY}"` : '',
    field.amountField && field.totalField ? `data-total-field="${escHtml(field.totalField)}"` : ''
  ].filter(Boolean).join(' ');
  return `<fieldset class="mb-3" ${attrs}>
    <legend class="form-label fs-6 mb-1">${escHtml(field.label)}${requiredBadge}</legend>
    <div data-lines-body>
    ${rows}
    </div>
    <button type="button" class="btn btn-sm btn-outline-secondary mb-2" data-lines-add${atMax ? ' disabled' : ''}>+ Add line</button>
    ${total}
    ${desc}
    ${errorSlot}
  </fieldset>`;
}

function renderFieldset(f: PluginFormatters, label: string, fieldsHtml: string): string {
  const { escapeHtml: escHtml } = f;
  return `<fieldset class="mb-4 border rounded p-3">
      <legend class="float-none w-auto px-2 fs-6 fw-semibold">${escHtml(label)}</legend>
      ${fieldsHtml}
    </fieldset>`;
}

function renderGroups(f: PluginFormatters, resolvedFields: ResolvedField[]): string {
  type Group = { label: string | null; fields: ResolvedField[] };
  const groups: Group[] = [];
  let current: Group = { label: null, fields: [] };

  for (const field of resolvedFields) {
    if (field.type === 'section') {
      if (current.label !== null || current.fields.length > 0) groups.push(current);
      current = { label: field.label, fields: [] };
    } else {
      current.fields.push(field);
    }
  }
  if (current.label !== null || current.fields.length > 0) groups.push(current);

  return groups.map(g => {
    const html = g.fields.map(field => renderField(f, field)).join('\n');
    return g.label ? renderFieldset(f, g.label, html) : html;
  }).join('\n');
}

function renderForm(f: PluginFormatters, form: FormDefinition, resolvedFields: ResolvedField[]): string {
  const { escapeHtml: escHtml } = f;
  const proxyBlock = form.proxySubmission ? renderFieldset(f, 'For Another Occupant', `
      <p class="text-muted small mb-3">Complete this section only if submitting on behalf of another resident. Leave blank if submitting for yourself.</p>
      <div class="mb-3">
        <label class="form-label" for="obo-name">Full Name</label>
        <input type="text" name="onBehalfOf[name]" id="obo-name" class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label" for="obo-email">Email</label>
        <input type="email" name="onBehalfOf[email]" id="obo-email" class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label" for="obo-phone">Phone</label>
        <input type="tel" name="onBehalfOf[phone]" id="obo-phone" class="form-control">
      </div>
      <div class="mb-3">
        <label class="form-label" for="obo-address">Unit Address</label>
        <input type="text" name="onBehalfOf[address]" id="obo-address" class="form-control">
      </div>`) : '';

  return `<div class="ngdp-form card shadow-sm" id="form-wrapper-${escHtml(form.id)}">
  <div class="card-body">
    <h4 class="card-title mb-3">${escHtml(form.title)}</h4>
    ${form.description ? `<p class="text-muted mb-3">${escHtml(form.description)}</p>` : ''}
    <div id="form-result-${escHtml(form.id)}"></div>
    <form data-ngdp-form="${escHtml(form.id)}" novalidate>
      ${renderGroups(f, resolvedFields)}
      ${proxyBlock}
      <button type="submit" class="btn btn-primary">Submit</button>
    </form>
  </div>
</div>
<script src="/addons/forms/js/forms-submit.js" defer></script>`;
}

const FormsPlugin = {
  name: 'Form',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    const { escapeHtml: escHtml } = context.formatters;
    const formId = typeof params['id'] === 'string' ? params['id'] : undefined;
    if (!formId) {
      return '<div class="alert alert-warning">Form: missing required parameter <code>id</code></div>';
    }

    const fdm = context.engine.getManager<FormsDataManager>('FormsDataManager');
    if (!fdm) {
      return '<div class="alert alert-danger">Form: FormsDataManager not available</div>';
    }

    const form = fdm.getDefinition(formId);
    if (!form) {
      return `<div class="alert alert-warning">Form: no form found with id <code>${escHtml(formId)}</code></div>`;
    }

    const cm = context.engine.getManager<ConfigurationManager>('ConfigurationManager');

    // Resolve unit record for user.unit.* prefill paths
    const userCtx = context.userContext as Record<string, unknown> | undefined;
    let unitRecord: Record<string, unknown> | undefined;
    const needsUnit = form.fields.some(f => f.prefill?.startsWith('user.unit.'));
    if (needsUnit && userCtx && cm) {
      const parcel = userCtx['parcel'] as string | undefined;
      if (parcel) {
        try {
          const fairwaysPath = cm.resolveDataPath('fairways');
          const raw = await fsp.readFile(path.join(fairwaysPath, 'units.json'), 'utf8');
          const units = JSON.parse(raw) as Array<Record<string, unknown>>;
          unitRecord = units.find(u => u['parcel'] === parcel);
        } catch { /* unit lookup failed — prefill renders empty */ }
      }
    }

    // Resolve optionsSource and prefill for each field; a lines field's
    // sub-fields once, for all its rows (#1913)
    const resolveField = async (field: FormField): Promise<ResolvedField> => {
      const base: ResolvedField = { ...field };
      if (field.type === 'dropdown' || field.type === 'checklist') {
        base.resolvedOptions = await resolveFieldOptions(context.engine, field, context.userContext);
      }
      if (field.type === 'lines') {
        base.resolvedFields = await Promise.all((field.fields ?? []).map(resolveField));
      }
      if (field.prefill && userCtx) {
        base.prefillValue = resolvePrefill(field.prefill, userCtx, unitRecord);
      }
      return base;
    };
    const resolvedFields: ResolvedField[] = await Promise.all(form.fields.map(resolveField));

    return renderForm(context.formatters, form, resolvedFields);
  }
};

export default FormsPlugin;
