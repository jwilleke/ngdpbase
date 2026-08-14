/**
 * #1030 — configured secrets must not survive into log output.
 *
 * The guards get as much attention as the happy path on purpose: a redactor
 * that mangles unrelated lines gets turned off, and a redactor that is off
 * protects nothing.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import {
  refreshRedactedSecrets,
  redactSecrets,
  redactSecretsFormat,
  clearRedactedSecrets,
  getRedactedSecretCount
} from '../redactSecrets.js';

const SECRET_KEYS = 'ngdpbase.config.secret-keys';

/** Stand-in for ConfigurationManager: a flat key→value map. */
function reader(values: Record<string, unknown>) {
  return {
    getProperty<T = unknown>(key: string, defaultValue?: T): T {
      return (key in values ? values[key] : defaultValue) as T;
    }
  };
}

beforeEach(() => {
  clearRedactedSecrets();
});

describe('refreshRedactedSecrets', () => {
  test('collects the values named by the secret-keys list', () => {
    const result = refreshRedactedSecrets(reader({
      [SECRET_KEYS]: ['ngdpbase.session.secret', 'ngdpbase.mail.provider.smtp.pass'],
      'ngdpbase.session.secret': 'a-long-session-secret',
      'ngdpbase.mail.provider.smtp.pass': 'hunter2-but-longer'
    }));

    expect(result.active).toBe(2);
    expect(result.skipped).toEqual([]);
  });

  test('replaces the table rather than accumulating across calls', () => {
    const config = reader({
      [SECRET_KEYS]: ['a.key'],
      'a.key': 'first-secret-value'
    });
    refreshRedactedSecrets(config);
    refreshRedactedSecrets(config);

    expect(getRedactedSecretCount()).toBe(1);
  });

  test('two keys holding the same value redact once', () => {
    const result = refreshRedactedSecrets(reader({
      [SECRET_KEYS]: ['a.key', 'b.key'],
      'a.key': 'identical-secret-value',
      'b.key': 'identical-secret-value'
    }));

    expect(result.active).toBe(1);
  });

  test('survives a missing or malformed config manager', () => {
    expect(refreshRedactedSecrets(null).active).toBe(0);
    expect(refreshRedactedSecrets(undefined).active).toBe(0);
    expect(refreshRedactedSecrets(reader({ [SECRET_KEYS]: 'not-an-array' })).active).toBe(0);
  });

  describe('guards — values that must NOT be redacted', () => {
    test('a short value is skipped, so it cannot mangle unrelated output', () => {
      const result = refreshRedactedSecrets(reader({
        [SECRET_KEYS]: ['ngdpbase.user.security.defaultpassword'],
        'ngdpbase.user.security.defaultpassword': 'admin'
      }));

      expect(result.active).toBe(0);
      expect(result.skipped).toEqual([
        { key: 'ngdpbase.user.security.defaultpassword', reason: 'too-short' }
      ]);
      expect(redactSecrets('admin logged in via the admin panel'))
        .toBe('admin logged in via the admin panel');
    });

    test('an env-ref pointer is skipped — the resolved value is the secret', () => {
      const result = refreshRedactedSecrets(reader({
        [SECRET_KEYS]: ['ngdpbase.mail.provider.smtp.pass'],
        'ngdpbase.mail.provider.smtp.pass': '$NGDPBASE_SMTP_PASS'
      }));

      expect(result.skipped).toEqual([
        { key: 'ngdpbase.mail.provider.smtp.pass', reason: 'env-ref' }
      ]);
      expect(redactSecrets('resolving $NGDPBASE_SMTP_PASS from env'))
        .toBe('resolving $NGDPBASE_SMTP_PASS from env');
    });

    test('empty, unset and non-string values are each skipped with a reason', () => {
      const result = refreshRedactedSecrets(reader({
        [SECRET_KEYS]: ['empty.key', 'missing.key', 'numeric.key'],
        'empty.key': '   ',
        'numeric.key': 3000
      }));

      expect(result.active).toBe(0);
      expect(result.skipped).toEqual([
        { key: 'empty.key', reason: 'empty' },
        { key: 'missing.key', reason: 'unset' },
        { key: 'numeric.key', reason: 'not-a-string' }
      ]);
    });

    test('an empty value does not redact every line', () => {
      refreshRedactedSecrets(reader({ [SECRET_KEYS]: ['empty.key'], 'empty.key': '' }));
      expect(redactSecrets('an ordinary log line')).toBe('an ordinary log line');
    });
  });
});

describe('redactSecrets', () => {
  test('replaces the value and names the key that held it', () => {
    refreshRedactedSecrets(reader({
      [SECRET_KEYS]: ['ngdpbase.session.secret'],
      'ngdpbase.session.secret': 'super-secret-session-key'
    }));

    expect(redactSecrets('session secret is super-secret-session-key here'))
      .toBe('session secret is [redacted:ngdpbase.session.secret] here');
  });

  test('replaces every occurrence on the line, not just the first', () => {
    refreshRedactedSecrets(reader({
      [SECRET_KEYS]: ['a.key'],
      'a.key': 'repeated-secret-value'
    }));

    expect(redactSecrets('repeated-secret-value and repeated-secret-value'))
      .toBe('[redacted:a.key] and [redacted:a.key]');
  });

  test('strikes the longer value first when one secret contains another', () => {
    // Shortest-first would leave a mangled tail of the longer secret on the line.
    refreshRedactedSecrets(reader({
      [SECRET_KEYS]: ['short.key', 'long.key'],
      'short.key': 'secret-value',
      'long.key': 'secret-value-with-more'
    }));

    expect(redactSecrets('token secret-value-with-more end'))
      .toBe('token [redacted:long.key] end');
  });

  test('does not throw on a secret full of regex metacharacters', () => {
    refreshRedactedSecrets(reader({
      [SECRET_KEYS]: ['a.key'],
      'a.key': 'p@$$w(rd).*+[]^'
    }));

    expect(redactSecrets('pass=p@$$w(rd).*+[]^ ok')).toBe('pass=[redacted:a.key] ok');
  });

  test('leaves lines alone when nothing is configured', () => {
    expect(redactSecrets('nothing configured yet')).toBe('nothing configured yet');
  });

  test('tolerates non-string input', () => {
    refreshRedactedSecrets(reader({ [SECRET_KEYS]: ['a.key'], 'a.key': 'a-secret-value' }));
    expect(redactSecrets(undefined as unknown as string)).toBeUndefined();
  });

  test('cannot catch a transformed value — documented limit, not a bug', () => {
    refreshRedactedSecrets(reader({
      [SECRET_KEYS]: ['a.key'],
      'a.key': 'plaintext-secret'
    }));

    const encoded = Buffer.from('plaintext-secret').toString('base64');
    expect(redactSecrets(`token ${encoded}`)).toBe(`token ${encoded}`);
  });
});

describe('redactSecretsFormat', () => {
  test('redacts the rendered message', () => {
    refreshRedactedSecrets(reader({
      [SECRET_KEYS]: ['ngdpbase.session.secret'],
      'ngdpbase.session.secret': 'super-secret-session-key'
    }));

    const info = { level: 'info', message: 'secret=super-secret-session-key' };
    const out = redactSecretsFormat().transform(info) as typeof info;

    expect(out.message).toBe('secret=[redacted:ngdpbase.session.secret]');
  });

  test('redacts an error stack, where a thrown credential surfaces', () => {
    refreshRedactedSecrets(reader({
      [SECRET_KEYS]: ['a.key'],
      'a.key': 'thrown-secret-value'
    }));

    const info = {
      level: 'error',
      message: 'boom',
      stack: 'Error: auth failed for thrown-secret-value\n    at x'
    };
    const out = redactSecretsFormat().transform(info) as typeof info;

    expect(out.stack).toBe('Error: auth failed for [redacted:a.key]\n    at x');
  });

  test('leaves a non-string message untouched for the printf stage', () => {
    refreshRedactedSecrets(reader({ [SECRET_KEYS]: ['a.key'], 'a.key': 'a-secret-value' }));

    const payload = { nested: 'a-secret-value' };
    const info = { level: 'info', message: payload };
    const out = redactSecretsFormat().transform(info) as typeof info;

    expect(out.message).toBe(payload);
  });

  test('is a pass-through before the table is filled', () => {
    const info = { level: 'info', message: 'anything at all' };
    const out = redactSecretsFormat().transform(info) as typeof info;

    expect(out.message).toBe('anything at all');
  });
});
