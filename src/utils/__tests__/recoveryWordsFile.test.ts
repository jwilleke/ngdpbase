/**
 * The recovery words sheet (#2144): the downloaded text and the print view
 * show the same thing — the site, when the words were made in the server's
 * local time, the 12 numbered words, what they are for and that the server
 * does not keep them — and no key material.
 *
 * Sabotaged once (then restored): the words numbered from 0 — the numbering
 * test went red.
 */
import { recoveryWordsFilename, recoveryWordsSheet, recoveryWordsText, serverLocalTime } from '../recoveryWordsFile';

const WORDS = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'];

describe('the recovery words sheet (#2144)', () => {
  const madeAt = new Date(2026, 9, 30, 5, 28);

  test('the text file: title, site name and address, when made, the numbered words, what they are for, not stored', () => {
    const text = recoveryWordsText(recoveryWordsSheet({ set: 'shared-folders', siteName: 'The Fairways', siteUrl: 'https://fairways.example', words: WORDS, madeAt }));
    const lines = text.split('\n');
    expect(lines[0]).toBe('The Fairways: shared folders\' recovery words');
    expect(text).toContain('Site: The Fairways (https://fairways.example)');
    expect(text).toContain(`Made: ${serverLocalTime(madeAt)}`);
    expect(lines.filter((l) => /^\s?\d+\. /.test(l))).toEqual(WORDS.map((w, i) => `${String(i + 1).padStart(2, ' ')}. ${w}`));
    expect(text).toMatch(/open the organization's shared folders/);
    expect(text).toMatch(/not stored on the server/);
  });

  test('a user\'s words say what they open', () => {
    const sheet = recoveryWordsSheet({ set: 'store', siteName: '', siteUrl: 'https://site.example', words: WORDS, madeAt });
    expect(sheet.title).toBe('https://site.example: your recovery words');
    expect(sheet.purpose).toMatch(/your encrypted vaults/);
  });

  test('server local time carries its offset', () => {
    expect(serverLocalTime(madeAt)).toMatch(/^2026-10-30 05:28 \(UTC[+-]\d{2}:\d{2}\)$/);
  });

  test('the file name is the site\'s, safe for any file system', () => {
    expect(recoveryWordsFilename('The Fairways / HOA', 'shared-folders')).toBe('The-Fairways-HOA-shared-folders-recovery-words.txt');
    expect(recoveryWordsFilename('', 'store')).toBe('ngdpbase-recovery-words.txt');
  });
});
