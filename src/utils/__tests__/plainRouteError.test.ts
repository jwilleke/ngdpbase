/**
 * plainRouteError (#2494): the log gets the whole error, the response gets the route's own sentence.
 */

import { plainRouteError } from '../plainRouteError';
import logger from '../logger';

vi.mock('../logger', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}));

const req = { method: 'POST', originalUrl: '/admin/backup?token=abc', userContext: { username: 'admin' } };

describe('plainRouteError', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns the route\'s message and nothing from the error', () => {
    const err = Object.assign(new Error("ENOENT: no such file or directory, open '/data/backups/x'"), { code: 'ENOENT' });
    const out = plainRouteError(req, err, 'The backup could not be made. Try again.');
    expect(out).toBe('The backup could not be made. Try again.');
    expect(out).not.toContain('ENOENT');
  });

  test('logs the full error with the route and the person', () => {
    const err = Object.assign(new Error("EACCES: permission denied, open '/data/x'"), { code: 'EACCES' });
    plainRouteError(req, err, 'The backup could not be made. Try again.');
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [line, meta] = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(line).toContain('POST /admin/backup');
    expect(line).toContain('admin');
    expect(line).not.toContain('token=abc');
    expect(meta.error).toContain('EACCES: permission denied');
    expect(meta.code).toBe('EACCES');
    expect(meta.stack).toContain('    at ');
  });

  test('logs a thrown non-Error and an anonymous caller', () => {
    plainRouteError({ method: 'GET', path: '/api/x' }, 'boom', 'It failed.');
    const [line, meta] = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(line).toContain('GET /api/x');
    expect(line).toContain('anonymous');
    expect(meta.error).toBe('boom');
  });
});
