/**
 * Tests for pageCarriesForm — the submit is accepted only from a page that
 * really holds the form.
 */

import { pageCarriesForm } from '../managers/pageAccess';

describe('pageCarriesForm', () => {
  test.each([
    ["[{Form id='ledger-entry'}]"],
    ['[{Form id="ledger-entry"}]'],
    ['[{Form id=ledger-entry}]'],
    ["Intro\n\n[{ Form  title='x' id='ledger-entry' }]\n"]
  ])('finds the form in %j', (content) => {
    expect(pageCarriesForm(content, 'ledger-entry')).toBe(true);
  });

  test.each([
    ["[{Form id='ledger-entry-2'}]"],
    ["[{Form id='other'}] ledger-entry"],
    ["[{FormOpen id='ledger-entry'}]"],
    ['ledger-entry'],
    ['']
  ])('does not find it in %j', (content) => {
    expect(pageCarriesForm(content, 'ledger-entry')).toBe(false);
  });
});
