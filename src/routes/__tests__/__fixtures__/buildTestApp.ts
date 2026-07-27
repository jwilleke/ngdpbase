/**
 * Shared test-app builder for route tests (#684).
 *
 * Before this fixture existed, each route test in `src/routes/__tests__/`
 * built its own `express()` with `json()` + `urlencoded()` and a hand-rolled
 * session / userContext / CSRF stub. None of them wired the actual
 * production `csrfMiddleware`, which left a coverage gap between the
 * middleware's own unit tests (`src/middleware/__tests__/csrf.test.ts`) and
 * the Playwright E2E suite — a regression at the handler/middleware
 * boundary would slip past `npm test`.
 *
 * This helper consolidates the boilerplate AND lets a test opt into the
 * real CSRF middleware via `withCsrf: true`. When opted in, the helper
 * mounts `src/middleware/csrf.ts` directly — no parallel impl, no drift.
 *
 * Typical usage:
 *
 * ```ts
 * import { buildTestApp } from './__fixtures__/buildTestApp';
 * import {
 *   TEST_CSRF_TOKEN,
 *   csrfTestHeaders
 * } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';
 *
 * let mockUserContext: { username: string; ... } | null = null;
 *
 * beforeEach(() => {
 *   mockUserContext = { username: 'alice', isAuthenticated: true, roles: ['admin'] };
 *   app = buildTestApp({
 *     withCsrf: true,
 *     userContext: () => mockUserContext   // provider — re-evaluated per request
 *   });
 *   routes.registerRoutes(app);
 * });
 *
 * it('POST succeeds with valid token', async () => {
 *   await request(app)
 *     .post('/save/X')
 *     .set(csrfTestHeaders())          // sends TEST_CSRF_TOKEN
 *     .send({ content: '...' })
 *     .expect(200);
 * });
 * ```
 *
 * Notes:
 *  - The default session contains `csrfToken: TEST_CSRF_TOKEN`. State-changing
 *    requests must submit that same token (via `csrfTestHeaders()` or
 *    `csrfTestBodyField()`) for CSRF-enabled apps to accept them.
 *  - `userContext` accepts a value OR a provider function. Use a provider
 *    when the test mutates the user across requests inside `beforeEach`.
 *  - `res.render` is stubbed by default to return `<html>stub</html>`, so
 *    tests don't need real EJS views on disk.
 */
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction
} from 'express';
import { csrfMiddleware } from '../../../middleware/csrf';
import { TEST_CSRF_TOKEN } from '../../../middleware/__tests__/__fixtures__/csrfTestHelpers';

export interface TestUserContext {
  username: string;
  isAuthenticated?: boolean;
  roles?: string[];
  displayName?: string;
  email?: string;
  [key: string]: unknown;
}

export type TestUserContextSource =
  | TestUserContext
  | null
  | (() => TestUserContext | null);

export interface BuildTestAppOptions {
  /**
   * When true, mount the real production CSRF middleware
   * (`src/middleware/csrf.ts`). Default: false — existing tests stay
   * unaffected and opt in when they're ready.
   */
  withCsrf?: boolean;

  /**
   * UserContext attached to `req.userContext` on every request. Pass a
   * function when the test reassigns `mockUserContext` between requests
   * (the common pattern in route tests).
   */
  userContext?: TestUserContextSource;

  /**
   * Extra fields merged into the default session. Useful for adding
   * `flashMessages`, `returnTo`, or test-specific scratch state without
   * losing the default `csrfToken` / `user` / `destroy` / `save` shape.
   */
  extraSession?: Record<string, unknown>;

  /**
   * Override the session's CSRF token. Defaults to `TEST_CSRF_TOKEN` from
   * `csrfTestHelpers`. Override only if a test is intentionally exercising
   * a token mismatch.
   */
  csrfToken?: string;

  /**
   * Stub `res.render` so tests don't need real EJS views on disk.
   *  - `true` (default): minimal `<html>stub</html>`.
   *  - `false`: don't stub — use whatever express resolves.
   *  - `(view, data) => string`: custom stub. Useful when tests assert on
   *    render arguments (e.g. `expect(res.text).toContain('data-state="form"')`).
   *    The returned string is sent as the response body.
   */
  stubRender?: boolean | ((view: string, data: unknown) => string);
}

function resolveUserContext(source: TestUserContextSource | undefined): TestUserContext | null {
  if (typeof source === 'function') return source();
  return source ?? null;
}

export function buildTestApp(options: BuildTestAppOptions = {}): Express {
  const {
    withCsrf = false,
    userContext,
    extraSession,
    csrfToken = TEST_CSRF_TOKEN,
    stubRender = true
  } = options;

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (stubRender) {
    const renderBody =
      typeof stubRender === 'function'
        ? stubRender
        : () => '<html>stub</html>';
    app.use((_req: Request, res: Response, next: NextFunction) => {
      res.render = (
        view: string,
        data: unknown,
        cb?: (err: Error | null, str?: string) => void
      ) => {
        const html = renderBody(view, data);
        if (cb) cb(null, html);
        else res.send(html);
      };
      next();
    });
  }

  app.use((req: Request, _res: Response, next: NextFunction) => {
    const resolvedUser = resolveUserContext(userContext);
    const session: Record<string, unknown> = {
      csrfToken,
      user: resolvedUser ? { username: resolvedUser.username } : null,
      destroy: (cb?: () => void) => cb?.(),
      save: (cb?: (err?: unknown) => void) => cb?.(),
      ...extraSession
    };
    const reqAny = req as unknown as Record<string, unknown>;
    reqAny.session = session;
    reqAny.userContext = resolvedUser;
    reqAny.sessionID = 'test-session-id';
    next();
  });

  if (withCsrf) {
    app.use(csrfMiddleware);
  }

  return app;
}
