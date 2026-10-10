/**
 * Tests for FormsDataManager — schema validation and buildSubmissionValidator
 */

import { FieldSchema, FormDefinitionSchema, buildSubmissionValidator, parseAmount } from '../managers/FormsDataManager';

// ── FieldSchema ───────────────────────────────────────────────────────────────

describe('FieldSchema', () => {
  const base = { name: 'myField', type: 'text', label: 'My Field' };

  test('accepts all supported field types', () => {
    const types = ['text', 'email', 'tel', 'textarea', 'date', 'time', 'dropdown', 'checkbox', 'hidden', 'section'];
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
