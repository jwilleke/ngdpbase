/**
 * The extension a stored attachment is named with (#1387).
 *
 * A stored file is `{generated-id}{ext}`. The id is ours. The extension used to
 * be whatever `path.extname()` returned for the uploaded name — and that
 * function promises everything after the last dot in the basename, not an
 * extension. The uploaded name is free text: a browser sends the leaf name of
 * the chosen file, but the multipart header can say anything.
 *
 * These tests pin the definition that replaced it: a short run of letters and
 * digits, or nothing at all.
 */

// The global setup mocks this provider for other suites; this one tests it.
vi.unmock('../BasicAttachmentProvider');

import { safeStoredExtension } from '../BasicAttachmentProvider';

describe('safeStoredExtension — ordinary uploads keep their extension (#1387)', () => {
  test.each([
    ['photo.jpg', 'image/jpeg', '.jpg'],
    ['Report.PDF', 'application/pdf', '.pdf'],
    ['notes.md', 'text/markdown', '.md'],
    ['archive.tar.gz', 'application/gzip', '.gz'],
    // Types no table here lists still keep their own extension.
    ['contract.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
    ['photo.heic', 'image/heic', '.heic']
  ])('%s -> %s', (name, mime, expected) => {
    expect(safeStoredExtension(name, mime)).toBe(expected);
  });

  test('an extensionless upload is stored under the bare id, as it always was', () => {
    expect(safeStoredExtension('README', 'text/plain')).toBe('.txt');
    expect(safeStoredExtension('README', 'application/x-unknown')).toBe('');
  });
});

describe('safeStoredExtension — a name that is not an extension (#1387)', () => {
  test('a crafted name contributes nothing; the MIME type decides instead', () => {
    // `path.extname` returns ".\\etc\\passwd" here, which we used to paste
    // straight onto the id.
    expect(safeStoredExtension('x.\\..\\..\\etc\\passwd', 'image/jpeg')).toBe('.jpg');
  });

  test('and nothing at all when the MIME type is unknown too', () => {
    expect(safeStoredExtension('x.\\..\\..\\etc\\passwd', 'application/x-unknown')).toBe('');
  });

  test.each([
    ['../../etc/passwd', ''],
    ['evil.php/../../x', ''],
    ['name.with space', ''],
    ['name.-', ''],
    ['name.', ''],
    ['.hidden', ''],
    ['name.%2e%2e%2fetc', ''],
    ['name.toolongextension', '']
  ])('%s yields no extension of its own', (name, expected) => {
    expect(safeStoredExtension(name, 'application/x-unknown')).toBe(expected);
  });

  test('no separator can ever appear in what is returned', () => {
    const hostile = [
      'x.\\..\\..\\etc\\passwd',
      '../../etc/passwd',
      'a.b/c',
      'a.b\\c',
      'a.' + '/'.repeat(20)
    ];
    for (const name of hostile) {
      const ext = safeStoredExtension(name, 'image/png');
      expect(ext.includes('/')).toBe(false);
      expect(ext.includes('\\')).toBe(false);
      expect(ext === '' || /^\.[a-z0-9]{1,8}$/.test(ext)).toBe(true);
    }
  });

  test('a MIME type with parameters still maps', () => {
    expect(safeStoredExtension('data', 'text/csv; charset=utf-8')).toBe('.csv');
  });

  test('missing inputs are handled rather than thrown on', () => {
    expect(safeStoredExtension('', undefined)).toBe('');
    expect(safeStoredExtension(undefined as unknown as string, undefined)).toBe('');
  });
});
