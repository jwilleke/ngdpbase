/**
 * The install status check shows a plain message when it fails, never the error's own text (#2494).
 */

import InstallRoutes from '../InstallRoutes';
import logger from '../../utils/logger';

vi.mock('../../services/InstallService.js', () => ({
  default: class {
    detectPartialInstallation = vi.fn().mockRejectedValue(
      Object.assign(new Error("EACCES: permission denied, open '/data/config/app-custom-config.json'"), { code: 'EACCES' })
    );
    isInstallRequired = vi.fn().mockResolvedValue(true);
  }
}));

describe('GET /install/status when the check fails (#2494)', () => {
  test('answers 500 with a plain message and logs the full error', async () => {
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    const router = new InstallRoutes({}).getRouter();
    const layer = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: (a: unknown, b: unknown) => Promise<void> }> } }> })
      .stack.find((l) => l.route?.path === '/status');
    const res = { statusCode: 200, status: vi.fn((c: number) => { res.statusCode = c; return res; }), json: vi.fn() };

    await layer.route.stack[0].handle({ method: 'GET', originalUrl: '/install/status' }, res);

    const body = JSON.stringify(res.json.mock.calls);
    expect(res.statusCode).toBe(500);
    expect(body).not.toMatch(/EACCES|permission denied|app-custom-config/i);
    expect(body).not.toMatch(/\n?\s{2,}at\s/);
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain('EACCES: permission denied');
    expect(logged).toContain('    at ');
  });
});
