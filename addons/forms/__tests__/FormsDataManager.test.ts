/**
 * Tests for FormsDataManager — schema validation and buildSubmissionValidator
 */

import { FieldSchema, FormDefinitionSchema, buildSubmissionValidator, fieldErrors, parseAmount } from '../managers/FormsDataManager';

// ── FieldSchema ───────────────────────────────────────────────────────────────

describe('FieldSchema', () => {
  const base = { name: 'myField', type: 'text', label: 'My Field' };

  test('accepts all supported field types', () => {
    const types = ['text', 'email', 'tel', 'textarea', 'date', 'time', 'dropdown', 'checkbox', 'hidden', 'section', 'amount', 'checklist'];
    for (const type of types) {
      expect(FieldSchema.safeParse({ ...base, type }).success).toBe(true);
    }
  });

  test('rejects unknown field types', () => {
    expect(FieldSchema.safeParse({ ...base, type: 'file' }).success).toBe(false);
    expect(FieldSchema.safeParse({ ...base, type: 'range' }).success).toBe(false);
  });

  test('accepts optional prefill property', () => {
    expect(FieldSchema.safeParse({ ...base, prefill: 'user.displayName' }).success).toBe(true);
  });

  test('accepts optional options array', () => {
    const result = FieldSchema.safeParse({ ...base, type: 'dropdown', options: ['A', 'B'] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.options).toEqual(['A', 'B']);
  });

  test('required defaults to false', () => {
    const result = FieldSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.required).toBe(false);
  });
});

// ── FormDefinitionSchema ──────────────────────────────────────────────────────

describe('FormDefinitionSchema', () => {
  const minimalForm = {
    id: 'test-form',
    title: 'Test Form',
    fields: [{ name: 'n', type: 'text', label: 'N' }]
  };

  test('accepts a valid minimal form', () => {
    expect(FormDefinitionSchema.safeParse(minimalForm).success).toBe(true);
  });

  test('rejects id with uppercase letters', () => {
    expect(FormDefinitionSchema.safeParse({ ...minimalForm, id: 'TestForm' }).success).toBe(false);
  });

  test('rejects id with spaces', () => {
    expect(FormDefinitionSchema.safeParse({ ...minimalForm, id: 'test form' }).success).toBe(false);
  });

  test('rejects empty fields array', () => {
    expect(FormDefinitionSchema.safeParse({ ...minimalForm, fields: [] }).success).toBe(false);
  });

  test('proxySubmission defaults to false', () => {
    const result = FormDefinitionSchema.safeParse(minimalForm);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.proxySubmission).toBe(false);
  });

  test('notifyRole defaults to admin', () => {
    const result = FormDefinitionSchema.safeParse(minimalForm);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notifyRole).toBe('admin');
  });

  test('accepts confirmationUrl', () => {
    const result = FormDefinitionSchema.safeParse({ ...minimalForm, confirmationUrl: '/view/confirm' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.confirmationUrl).toBe('/view/confirm');
  });
});

// ── buildSubmissionValidator ──────────────────────────────────────────────────

describe('buildSubmissionValidator', () => {
  function makeForm(fields: object[]) {
    return FormDefinitionSchema.parse({
      id: 'test-form',
      title: 'Test Form',
      fields
    });
  }

  test('skips section fields — they contribute no submission data', () => {
    const form = makeForm([
      { name: 'sec', type: 'section', label: 'Section' },
      { name: 'name', type: 'text', label: 'Name', required: true }
    ]);
    const v = buildSubmissionValidator(form);
    const shape = v.shape;
    expect('sec' in shape).toBe(false);
    expect('name' in shape).toBe(true);
  });

  test('skips hidden fields', () => {
    const form = makeForm([
      { name: 'csrf', type: 'hidden', label: 'CSRF' },
      { name: 'email', type: 'email', label: 'Email' }
    ]);
    const v = buildSubmissionValidator(form);
    expect('csrf' in v.shape).toBe(false);
    expect('email' in v.shape).toBe(true);
  });

  test('required text field rejects empty string', () => {
    const form = makeForm([{ name: 'name', type: 'text', label: 'Name', required: true }]);
    const v = buildSubmissionValidator(form);
    expect(v.safeParse({ name: '' }).success).toBe(false);
    expect(v.safeParse({ name: 'Alice' }).success).toBe(true);
  });

  test('optional text field accepts empty string', () => {
    const form = makeForm([{ name: 'notes', type: 'text', label: 'Notes', required: false }]);
    const v = buildSubmissionValidator(form);
    expect(v.safeParse({ notes: '' }).success).toBe(true);
    expect(v.safeParse({}).success).toBe(true);
  });

  test('email field validates format', () => {
    const form = makeForm([{ name: 'email', type: 'email', label: 'Email', required: true }]);
    const v = buildSubmissionValidator(form);
    expect(v.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(v.safeParse({ email: 'user@example.com' }).success).toBe(true);
  });

  test('tel field requires minimum 7 characters when present', () => {
    const form = makeForm([{ name: 'phone', type: 'tel', label: 'Phone', required: true }]);
    const v = buildSubmissionValidator(form);
    expect(v.safeParse({ phone: '123' }).success).toBe(false);
    expect(v.safeParse({ phone: '555-1234' }).success).toBe(true);
  });

  test('optional tel field allows empty string', () => {
    const form = makeForm([{ name: 'phone', type: 'tel', label: 'Phone', required: false }]);
    const v = buildSubmissionValidator(form);
    expect(v.safeParse({ phone: '' }).success).toBe(true);
  });

  test('checkbox field accepts "on", "true", "1"', () => {
    const form = makeForm([{ name: 'agree', type: 'checkbox', label: 'Agree', required: true }]);
    const v = buildSubmissionValidator(form);
    expect(v.safeParse({ agree: 'on' }).success).toBe(true);
    expect(v.safeParse({ agree: 'true' }).success).toBe(true);
    expect(v.safeParse({ agree: '1' }).success).toBe(true);
    expect(v.safeParse({ agree: 'yes' }).success).toBe(false);
  });

  test('handles form with mixed field types including section', () => {
    const form = makeForm([
      { name: 'sec1', type: 'section', label: 'Details' },
      { name: 'date', type: 'date', label: 'Date', required: true },
      { name: 'sec2', type: 'section', label: 'Contact' },
      { name: 'email', type: 'email', label: 'Email', required: false }
    ]);
    const v = buildSubmissionValidator(form);
    expect('sec1' in v.shape).toBe(false);
    expect('sec2' in v.shape).toBe(false);
    expect('date' in v.shape).toBe(true);
    expect('email' in v.shape).toBe(true);
  });
});

// ── parseAmount ───────────────────────────────────────────────────────────────

describe('parseAmount', () => {
  test.each([
    ['125.50', 12550], ['125.5', 12550], ['1250', 125000], ['$1,250.00', 125000], [' 0.01 ', 1]
  ])('%j is %d cents', (raw, cents) => {
    expect(parseAmount(raw)).toBe(cents);
  });

  test.each([['0'], ['0.00'], ['-5'], ['12.345'], ['abc'], [''], ['1e3'], ['$'], ['1.2.3']])('%j is refused', (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});

// ── lines: repeating rows of sub-fields (#1913) ───────────────────────────────

describe('lines (#1913)', () => {
  const LINES = {
    name: 'lines', type: 'lines', label: 'Lines', required: true, minRows: 1, maxRows: 3,
    fields: [
      { name: 'amount',   type: 'amount',   label: 'Amount',   required: true },
      { name: 'fundId',   type: 'dropdown', label: 'Fund',     required: true, optionsSource: 'fetch:LedgerManager.toFormOptions(list=funds)' },
      { name: 'category', type: 'dropdown', label: 'Category', required: true, options: ['4100', '4200'] },
      { name: 'memo',     type: 'text',     label: 'Note' }
    ],
    amountField: 'amount', totalField: 'total'
  };
  const form = (lines: object = LINES) => FormDefinitionSchema.parse({
    id: 'receipt', title: 'Receipt',
    fields: [lines, { name: 'total', type: 'amount', label: 'Total', required: true }]
  });
  const CHOICES = new Map([['lines.fundId', ['general', 'reserve']], ['lines.category', ['4100', '4200']]]);
  const row = (o: object = {}) => ({ amount: '50', fundId: 'general', category: '4100', memo: '', ...o });
  const EMPTY = { amount: '', fundId: '', category: '', memo: '' };

  describe('schema', () => {
    test('a lines field with sub-fields parses, and keeps them', () => {
      expect(form().fields[0].fields?.map(f => f.name)).toEqual(['amount', 'fundId', 'category', 'memo']);
    });

    test('a lines field without sub-fields is refused', () => {
      expect(FieldSchema.safeParse({ name: 'l', type: 'lines', label: 'L' }).success).toBe(false);
      expect(FieldSchema.safeParse({ name: 'l', type: 'lines', label: 'L', fields: [] }).success).toBe(false);
    });

    test('lines inside lines is refused', () => {
      const nested = { ...LINES, fields: [...LINES.fields, { name: 'inner', type: 'lines', label: 'Inner', fields: [{ name: 'x', type: 'text', label: 'X' }] }] };
      expect(FieldSchema.safeParse(nested).success).toBe(false);
      expect(FormDefinitionSchema.safeParse({ id: 'f', title: 'F', fields: [nested] }).success).toBe(false);
    });

    test.each([['section'], ['hidden'], ['checklist']])('a %s sub-field is refused: a row holds one value per sub-field', (type) => {
      expect(FieldSchema.safeParse({ ...LINES, amountField: undefined, fields: [{ name: 'x', type, label: 'X' }] }).success).toBe(false);
    });

    test('amountField must name an amount sub-field, and minRows may not exceed maxRows', () => {
      expect(FieldSchema.safeParse({ ...LINES, amountField: 'memo' }).success).toBe(false);
      expect(FieldSchema.safeParse({ ...LINES, amountField: 'nope' }).success).toBe(false);
      expect(FieldSchema.safeParse({ ...LINES, minRows: 4, maxRows: 3 }).success).toBe(false);
    });
  });

  describe('validation', () => {
    test('submits an array of rows, amounts in minor units', () => {
      const r = buildSubmissionValidator(form(), CHOICES).safeParse({
        lines: [row(), row({ amount: '$1,250.05', fundId: 'reserve', category: '4200', memo: 'dues' })], total: '1300.05'
      });
      expect(r.success).toBe(true);
      expect(r.data).toEqual({
        lines: [
          { amount: 5000, fundId: 'general', category: '4100', memo: '' },
          { amount: 125005, fundId: 'reserve', category: '4200', memo: 'dues' }
        ],
        total: 130005
      });
    });

    test('fully empty trailing rows are dropped; an empty row in the middle is not', () => {
      const v = buildSubmissionValidator(form(), CHOICES);
      const r = v.safeParse({ lines: [row(), EMPTY, EMPTY], total: '50' });
      expect(r.success && r.data.lines).toEqual([{ amount: 5000, fundId: 'general', category: '4100', memo: '' }]);
      const middle = v.safeParse({ lines: [EMPTY, row()], total: '50' });
      expect(middle.success).toBe(false);
      if (!middle.success) expect(fieldErrors(middle.error)['lines[0].amount']).toMatch(/Amount/);
    });

    test('a dropdown value the row did not offer is refused, keyed lines[i].field', () => {
      const r = buildSubmissionValidator(form(), CHOICES).safeParse({ lines: [row(), row({ fundId: 'someone-elses' })], total: '100' });
      expect(r.success).toBe(false);
      if (!r.success) expect(fieldErrors(r.error)).toEqual({ 'lines[1].fundId': 'Fund: choose one of the listed options' });
    });

    test('each row gets the top-level rules: required, email, amount', () => {
      const lines = { ...LINES, fields: [...LINES.fields, { name: 'who', type: 'email', label: 'Who' }] };
      const r = buildSubmissionValidator(form(lines), CHOICES).safeParse({
        lines: [row({ who: 'nope' }), row({ amount: '12.345', category: '' })], total: '1'
      });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(['lines[0].who', 'lines[1].amount', 'lines[1].category']);
      }
    });

    test('required: no rows, or only empty ones, is refused on the field', () => {
      const v = buildSubmissionValidator(form(), CHOICES);
      for (const lines of [undefined, [], [EMPTY]]) {
        const r = v.safeParse({ lines, total: '1' });
        expect(r.success).toBe(false);
        if (!r.success) expect(fieldErrors(r.error).lines).toBe('Lines: add at least one line');
      }
    });

    test('minRows and maxRows', () => {
      const v = buildSubmissionValidator(form({ ...LINES, required: false, minRows: 2, maxRows: 3 }), CHOICES);
      const few = v.safeParse({ lines: [row()], total: '1' });
      expect(few.success).toBe(false);
      if (!few.success) expect(fieldErrors(few.error).lines).toBe('Lines: add at least 2 lines');
      const many = v.safeParse({ lines: [row(), row(), row(), row()], total: '1' });
      expect(many.success).toBe(false);
      if (!many.success) expect(fieldErrors(many.error).lines).toBe('Lines: no more than 3 lines');
      expect(v.safeParse({ lines: [row(), row(), row()], total: '1' }).success).toBe(true);
    });

    test('lines that are not a list are refused; keys a row does not have are dropped', () => {
      const v = buildSubmissionValidator(form(), CHOICES);
      expect(v.safeParse({ lines: 'x', total: '1' }).success).toBe(false);
      const r = v.safeParse({ lines: [{ ...row(), extra: 'x' }], total: '1' });
      expect(r.success && r.data.lines).toEqual([{ amount: 5000, fundId: 'general', category: '4100', memo: '' }]);
    });
  });
});
