/**
 * Everything a test wrote to a (mocked) logger, one line per call, every
 * argument stringified — for "this never reached the server log" checks
 * (#1916). Defaults to the global logger mock from vitest.setup.ts; pass a
 * child logger (e.g. NotificationManager's) to read that one instead.
 */
import logger from '../../../utils/logger';

type MockedLevel = { mock: { calls: unknown[][] } };

export function loggedText(target: unknown = logger): string {
  const l = target as Record<string, MockedLevel | undefined>;
  return ['error', 'warn', 'info', 'debug']
    .flatMap((level) => (l[level]?.mock.calls ?? []).map((c) => c.map((a) => (a instanceof Error ? `${a.message} ${a.stack ?? ''}` : String(a))).join(' ')))
    .join('\n');
}
