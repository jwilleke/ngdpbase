import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import WikiRoutes from '../WikiRoutes';
import { buildTestApp } from './__fixtures__/buildTestApp';
import { csrfTestHeaders } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';

/**
 * #2359: POST /files/upload asks who is signed in BEFORE multer reads the body, so a signed-out
 * caller's file (up to the 10 MB limit and past it) is never buffered.
 */
const mockEngine = {
  getManager: vi.fn(() => null),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
};

const OVER_THE_LIMIT = Buffer.alloc(11 * 1024 * 1024, 'a');

function appFor(userContext: { username: string; isAuthenticated: boolean } | null) {
  const app = buildTestApp({ withCsrf: true, userContext });
  const seen: Request[] = [];
  app.use((req: Request, _res: Response, next: NextFunction) => { seen.push(req); next(); });
  new WikiRoutes(mockEngine).registerRoutes(app);
  return { app, seen };
}

describe('POST /files/upload checks sign-in before the body is read (#2359)', () => {
  test('a signed-out upload over the limit is refused and none of the body is read', async () => {
    const { app, seen } = appFor(null);
    const res = await request(app)
      .post('/files/upload')
      .set(csrfTestHeaders())
      .set('Accept', 'application/json')
      .field('place', 'any')
      .attach('file', OVER_THE_LIMIT, 'big.bin')
      .ok(() => true);
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(1);
    expect(seen[0].readableDidRead).toBe(false);
    expect((seen[0] as Request & { file?: unknown }).file).toBeUndefined();
  });

  test('a signed-in upload over the limit still reaches multer and is refused as too large', async () => {
    const { app, seen } = appFor({ username: 'ed', isAuthenticated: true });
    const res = await request(app)
      .post('/files/upload')
      .set(csrfTestHeaders())
      .set('Accept', 'application/json')
      .field('place', 'any')
      .attach('file', OVER_THE_LIMIT, 'big.bin')
      .ok(() => true);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/larger/);
    expect(seen[0].readableDidRead).toBe(true);
  });
});
