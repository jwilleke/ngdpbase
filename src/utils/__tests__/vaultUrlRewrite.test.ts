/**
 * #1506 — links naming a private page by its old private/… form are rewritten
 * to vaults/… once, and only when they name a vault that exists.
 */
import { rewriteLegacyVaultUrls } from '../vaultUrlRewrite';

const VAULTS = new Set(['jim/default', 'molly/journal']);

describe('rewriteLegacyVaultUrls (#1506)', () => {
  test('a URL path, a page name in a bracket link and an encoded /view/ link', () => {
    const before = [
      'See [my list](/private/jim/default/Shopping list).',
      'Also [notes|private/molly/journal/Day one].',
      'Old: /view/private%2Fjim%2Fdefault%2FDiary'
    ].join('\n');
    const result = rewriteLegacyVaultUrls(before, VAULTS);
    expect(result.content).toBe([
      'See [my list](/vaults/jim/default/Shopping list).',
      'Also [notes|vaults/molly/journal/Day one].',
      'Old: /view/vaults%2Fjim%2Fdefault%2FDiary'
    ].join('\n'));
    expect(result.rewritten).toBe(3);
  });

  test('text that only looks like a vault address is left alone', () => {
    const text = 'Data under /private/var/folders/x, secrets in private/secrets.md, and /private/nobody/default/X';
    expect(rewriteLegacyVaultUrls(text, VAULTS)).toEqual({ content: text, rewritten: 0 });
  });

  test('the #1457 form [store/Title] carries no prefix and is untouched', () => {
    const text = 'Link: [default/Diary]';
    expect(rewriteLegacyVaultUrls(text, VAULTS)).toEqual({ content: text, rewritten: 0 });
  });

  test('a second run writes nothing', () => {
    const once = rewriteLegacyVaultUrls('(/private/jim/default/A)', VAULTS).content;
    expect(rewriteLegacyVaultUrls(once, VAULTS)).toEqual({ content: once, rewritten: 0 });
  });
});
