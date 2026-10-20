/**
 * #1915 — the submission email's details read as the form did: each field's
 * label, money through core's formatMoney, choices by their labels, and each
 * lines row with its sub-fields.
 */
import { submissionDetails } from '../managers/submissionText';
import { FormDefinitionSchema } from '../managers/FormsDataManager';
import { TEST_FORMATTERS } from '../../../dist/src/test-support/plugins.js';

const money = (cents: number): string => TEST_FORMATTERS.formatMoney(cents, 'USD');

const form = FormDefinitionSchema.parse({
  id: 'receipt',
  title: 'Receipt',
  fields: [
    { name: 'sec', type: 'section', label: 'Details' },
    { name: 'payer', type: 'text', label: 'Paid by' },
    { name: 'secret', type: 'hidden', label: 'Hidden' },
    { name: 'total', type: 'amount', label: 'Receipt total' },
    { name: 'fund', type: 'dropdown', label: 'Fund', optionsSource: 'fetch:LedgerManager.toFormOptions(list=funds)' },
    { name: 'receiptIds', type: 'checklist', label: 'Receipts', options: ['r1', 'r2'] },
    { name: 'agree', type: 'checkbox', label: 'Rules read' },
    { name: 'note', type: 'text', label: 'Note' },
    {
      name: 'lines', type: 'lines', label: 'Lines',
      fields: [
        { name: 'amount', type: 'amount', label: 'Amount' },
        { name: 'category', type: 'dropdown', label: 'Category', options: ['4100'] },
        { name: 'memo', type: 'text', label: 'Memo' }
      ]
    }
  ]
});

const OPTIONS = new Map([
  ['fund', [{ value: 'general', label: 'General Fund' }]],
  ['receiptIds', [{ value: 'r1', label: 'Receipt 1' }, { value: 'r2', label: 'Receipt 2' }]],
  ['lines.category', [{ value: '4100', label: 'Dues income' }]]
]);

const DATA = {
  payer: 'Molly',
  secret: 'x',
  total: 6250,
  fund: 'general',
  receiptIds: ['r1', 'r2'],
  agree: 'on',
  note: '',
  lines: [
    { amount: 5000, category: '4100', memo: '' },
    { amount: 1250, category: '4100', memo: 'dues' }
  ]
};

describe('submissionDetails (#1915)', () => {
  const details = submissionDetails(form, DATA, OPTIONS, TEST_FORMATTERS.formatMoney);

  test('one line per field that has a value, under the form\'s labels; hidden and section left out', () => {
    expect(details).toEqual([
      '  Paid by: Molly',
      `  Receipt total: ${money(6250)}`,
      '  Fund: General Fund',
      '  Receipts: Receipt 1, Receipt 2',
      '  Rules read: Yes',
      '  Lines:',
      `    1. Amount: ${money(5000)} · Category: Dues income`,
      `    2. Amount: ${money(1250)} · Category: Dues income · Memo: dues`
    ]);
  });

  test('an unticked checkbox reads No', () => {
    expect(submissionDetails(form, { agree: undefined }, OPTIONS, TEST_FORMATTERS.formatMoney)).toEqual(['  Rules read: No']);
  });

  test('a value with no matching choice shows as sent, never a label from another list', () => {
    expect(submissionDetails(form, { fund: 'reserve', agree: 'on' }, new Map(), TEST_FORMATTERS.formatMoney))
      .toEqual(['  Fund: reserve', '  Rules read: Yes']);
  });

  test('no lines, or an empty checklist, adds nothing', () => {
    expect(submissionDetails(form, { lines: [], receiptIds: [], agree: 'on' }, OPTIONS, TEST_FORMATTERS.formatMoney))
      .toEqual(['  Rules read: Yes']);
  });
});
