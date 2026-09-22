/**
 * Private page titles never reach a log line or an audit event (#1461).
 */
import { redactPrivateNames, redactPrivateNamesDeep } from '../redactPrivateNames';

describe('redactPrivateNames (#1461)', () => {
  test.each([
    ['[VIEW] pageName=private/admin/vault/MergerNotes user=admin roles=admin',
      '[VIEW] pageName=private/admin/vault/[redacted] user=admin roles=admin'],
    ['[ACL] checkPagePermissionWithContext page=private/molly/default/Merger notes 2026 action=view',
      '[ACL] checkPagePermissionWithContext page=private/molly/default/[redacted] action=view'],
    ['Saved page \'private/molly/default/Molly diary\' with versioning',
      'Saved page \'private/molly/default/[redacted]\' with versioning'],
    ['GET /private/molly/default/Merger%20notes/edit 200',
      'GET /private/molly/default/[redacted]/edit 200'],
    ['redirect to /view/private%2Fmolly%2Fdefault%2FMerger%20notes?x=1',
      'redirect to /view/private%2Fmolly%2Fdefault%2F[redacted]?x=1'],
    ['failed for "private/jim/default/Captures — jim — 2026-09-14"',
      'failed for "private/jim/default/[redacted]"'],
    ['ends the line private/jim/default/Refrigerator-kitchen',
      'ends the line private/jim/default/[redacted]']
  ])('strikes the title: %s', (line, expected) => {
    expect(redactPrivateNames(line)).toBe(expected);
  });

  test('keeps owner and store, and leaves store files and public names alone', () => {
    expect(redactPrivateNames('/data/pages/private/molly/default/6f0291c2-3f8a-4d0c-97b7-12b89ee8f22a.md'))
      .toBe('/data/pages/private/molly/default/6f0291c2-3f8a-4d0c-97b7-12b89ee8f22a.md');
    expect(redactPrivateNames('/data/pages/private/molly/default/pages-index.json'))
      .toBe('/data/pages/private/molly/default/pages-index.json');
    expect(redactPrivateNames('[VIEW] pageName=Private Notes user=jim')).toBe('[VIEW] pageName=Private Notes user=jim');
    expect(redactPrivateNames('the private/public split')).toBe('the private/public split');
  });

  test('is idempotent', () => {
    const once = redactPrivateNames('page=private/a/b/Secret user=x');
    expect(redactPrivateNames(once)).toBe(once);
  });

  test('walks an audit event: every string field, nested', () => {
    const event = {
      eventType: 'page.save',
      resource: 'private/molly/default/Diary',
      metadata: { pageName: 'private/molly/default/Diary', bytes: 12, tags: ['private/molly/default/Diary'] },
      at: 5
    };
    expect(redactPrivateNamesDeep(event)).toEqual({
      eventType: 'page.save',
      resource: 'private/molly/default/[redacted]',
      metadata: { pageName: 'private/molly/default/[redacted]', bytes: 12, tags: ['private/molly/default/[redacted]'] },
      at: 5
    });
  });
});
