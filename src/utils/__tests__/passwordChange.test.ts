/**
 * #1592 — one definition of a password change, used by UserManager and the
 * offline reset script alike.
 */
import { passwordChangedAtSeconds, setPassword } from '../passwordChange';
import { verifyPassword } from '../passwordHash';

describe('setPassword (#1592)', () => {
  test('hashes, ends other sessions, and records when', async () => {
    const record: { password?: string; sessionGeneration?: number; passwordChangedAt?: string } = { password: 'old', sessionGeneration: 2 };
    await setPassword(record, 'correct horse', new Date('2026-10-04T12:00:00Z'));
    expect(record.password).not.toBe('correct horse');
    expect(await verifyPassword('correct horse', record.password)).toBe(true);
    expect(record.sessionGeneration).toBe(3);
    expect(record.passwordChangedAt).toBe('2026-10-04T12:00:00.000Z');
  });

  test('passwordChangedAtSeconds: epoch seconds, or null when never changed', async () => {
    expect(passwordChangedAtSeconds({ passwordChangedAt: '2026-10-04T12:00:00.000Z' })).toBe(Date.UTC(2026, 9, 4, 12) / 1000);
    expect(passwordChangedAtSeconds({})).toBeNull();
    expect(passwordChangedAtSeconds({ passwordChangedAt: 'not a date' })).toBeNull();
    expect(passwordChangedAtSeconds(undefined)).toBeNull();
  });
});
