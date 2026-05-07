/**
 * @file src/app.ts
 * @description Main application entry point for the ngdpbase Engine.
 *
 * Compiled to dist/src/app.js — launched via `node dist/src/app.js` or ecosystem.config.js.
 * All project-root paths use process.cwd() rather than __dirname because
 * __dirname resolves to dist/src/ after compilation.
 */

import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import fs from 'fs-extra';

import logger from './utils/logger.js';
import WikiEngine from './WikiEngine.js';
import type { WikiEngine as IWikiEngine } from './types/WikiEngine.js';
import WikiRoutes from './routes/WikiRoutes.js';
import WikiContext from './context/WikiContext.js';
import InstallRoutes from './routes/InstallRoutes.js';
import InstallService from './services/InstallService.js';
import { ThemeManager } from './managers/ThemeManager.js';
import type PageManager from './managers/PageManager.js';

// Project root — reliable because PM2/server.sh always run from the project directory.
// __dirname would resolve to dist/src/ after compilation, so it cannot be used for
// views/, public/, themes/, addons/, .env, or the PID file.
const projectRoot = process.cwd();

// Load .env file so PORT and other env vars are available without shell export
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

// --- PID File Lock to Prevent Multiple Instances ---
const PID_FILE = path.join(projectRoot, '.ngdpbase.pid');

// Mutable reference populated once the engine is ready — used by the SIGTERM handler
let engineRef: IWikiEngine | null = null;

function checkAndCreatePidLock(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      const existingPid = fs.readFileSync(PID_FILE, 'utf8').trim();

      try {
        process.kill(Number(existingPid), 0); // Signal 0 checks if process exists
        console.error('❌ FATAL: Another instance of ngdpbase is already running (PID: ' + existingPid + ')');
        console.error('   If you believe this is an error, delete: ' + PID_FILE);
        process.exit(1);
      } catch {
        // Process doesn't exist — stale PID file
        console.log('⚠️  Removing stale PID file from previous instance');
        fs.unlinkSync(PID_FILE);
      }
    }

    fs.writeFileSync(PID_FILE, process.pid.toString());
    console.log('🔒 PID lock created: ' + process.pid);

    const cleanup = (): void => {
      try {
        if (fs.existsSync(PID_FILE)) {
          const pidInFile = fs.readFileSync(PID_FILE, 'utf8').trim();
          if (pidInFile === process.pid.toString()) {
            fs.unlinkSync(PID_FILE);
            console.log('🔓 PID lock removed');
          }
        }
      } catch {
        // Ignore cleanup errors
      }
    };

    process.on('exit', cleanup);

    process.on('SIGINT', () => {
      void (async (): Promise<void> => {
        logger.info('[APP] SIGINT received — shutting down');
        try {
          if (engineRef) await engineRef.shutdown();
        } catch { /* ignore */ }
        cleanup();
        process.exit(0);
      })();
    });

    process.on('SIGTERM', () => {
      void (async (): Promise<void> => {
        logger.info('[APP] SIGTERM received — shutting down gracefully');
        try {
          if (engineRef) await engineRef.shutdown();
        } catch (e) {
          logger.warn(`[APP] Error during engine shutdown: ${(e as Error).message}`);
        }
        logger.info('[APP] Shutdown complete');
        cleanup();
        process.exit(0);
      })();
    });

    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      cleanup();
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ FATAL: Could not create PID lock:', (error as Error).message);
    process.exit(1);
  }
}

// Check for existing instance before starting
checkAndCreatePidLock();

// --- Main Application Bootstrap ---
void (async (): Promise<void> => {
  const app = express();
  let engine: IWikiEngine;
  let engineReady = false;

  // 1. Setup View Engine and static files first so we can serve the maintenance page
  app.set('views', path.join(projectRoot, 'views'));
  app.set('view engine', 'ejs');
  app.set('view cache', false);
  app.use(express.static(path.join(projectRoot, 'public')));
  app.use('/themes', express.static(path.join(projectRoot, 'themes')));
  app.use('/addons', express.static(path.join(projectRoot, 'addons')));

  // 2. Initialization gate middleware — serves maintenance page while engine starts
  app.use((req: Request, res: Response, next: NextFunction): void => {
    if (engineReady) { next(); return; }

    if (req.path.startsWith('/css') || req.path.startsWith('/js') ||
        req.path.startsWith('/images') || req.path.startsWith('/themes') ||
        req.path.startsWith('/addons') ||
        req.path === '/favicon.ico' || req.path === '/favicon.svg') {
      next(); return;
    }

    res.status(503).render('maintenance', {
      message: 'The system is starting up. This may take a moment while pages are indexed.',
      estimatedDuration: null,
      notifications: [],
      allowAdmins: false,
      isAdmin: false
    });
  });

  // 3. Start listening immediately so the server accepts connections during initialization
  const defaultPort = parseInt(process.env.PORT ?? '3000', 10);

  app.listen(defaultPort, () => {
    console.log(`🚀 Server listening on port ${defaultPort} (initializing engine...)`);
  });

  // 4. Initialize the WikiEngine
  try {
    console.log('🚀 Initializing ngdpbase Engine...');
    engine = new WikiEngine() as unknown as IWikiEngine;
    engine.app = app; // expose Express app to add-ons before initialization (#359)
    await engine.initialize();
    engineRef = engine;
    console.log('✅ ngdpbase Engine initialized successfully.');
  } catch (error) {
    console.error('🔥🔥🔥 FATAL: Failed to initialize ngdpbase Engine.');
    console.error(error);
    process.exit(1);
  }

  // 5. Now that the engine is ready, set up the remaining middleware and routes
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Install check middleware
  const installService = new InstallService(engine);
  const headlessInstall = process.env.HEADLESS_INSTALL === 'true';

  app.use((req: Request, res: Response, next: NextFunction): void => {
    if (req.path.startsWith('/install') ||
        req.path.startsWith('/css') ||
        req.path.startsWith('/js') ||
        req.path.startsWith('/images') ||
        req.path === '/favicon.ico' ||
        req.path === '/favicon.svg') {
      next(); return;
    }

    void (async (): Promise<void> => {
      try {
        const installRequired = await installService.isInstallRequired();
        if (installRequired) {
          if (headlessInstall) {
            console.log('🤖 HEADLESS_INSTALL=true detected, performing automated installation...');
            const result = await installService.processHeadlessInstallation();

            if (result.success) {
              console.log('✅ Headless installation completed successfully');
              console.log(`   - Pages copied: ${String(result.steps.pagesCopied)}`);
              next(); return;
            } else {
              console.error('❌ Headless installation failed:', result.error);
              res.status(500).send(`Headless installation failed: ${result.error ?? 'unknown error'}`);
              return;
            }
          }

          res.redirect('/install'); return;
        }
      } catch (error) {
        console.error('Error checking install status, redirecting to /install:', (error as Error).message);
        res.redirect('/install'); return;
      }

      next();
    })();
  });

  // Setup express-session with file store
  const configManager = engine.getManager('ConfigurationManager') as {
    getProperty<T>(key: string, defaultValue: T): T;
    getResolvedDataPath(key: string, fallback: string): string;
  };

  const activeThemeName = configManager.getProperty('ngdpbase.theme.active', 'default');
  const themesDir = path.join(projectRoot, 'themes');
  const viewsDir = path.join(projectRoot, 'views');
  const themeManager = new ThemeManager(activeThemeName, themesDir);

  const addonsManager = engine.getManager('AddonsManager') as {
    getRegisteredStylesheets?(): string[];
  } | null;

  app.use((_req: Request, res: Response, next: NextFunction): void => {
    Object.assign(res.locals, themeManager.paths);
    res.locals.addonStylesheets = addonsManager?.getRegisteredStylesheets?.() ?? [];

    const currentTheme = configManager.getProperty('ngdpbase.theme.active', 'default');
    const themePartialsDir = path.join(themesDir, currentTheme, 'partials');
    res.locals.views = fs.existsSync(themePartialsDir)
      ? [themePartialsDir, viewsDir]
      : [viewsDir];

    next();
  });

  const sessionPath = configManager.getResolvedDataPath('ngdpbase.session.storagedir', './data/sessions');
  await fs.ensureDir(sessionPath);

  const FileStore = sessionFileStore(session);

  app.use(session({
    store: new FileStore({
      path: sessionPath,
      ttl: configManager.getProperty('ngdpbase.session.max-age', 24 * 60 * 60 * 1000) / 1000,
      retries: 0,
      reapInterval: 3600
    }),
    secret: configManager.getProperty('ngdpbase.session.secret', 'ngdpbase-session-secret-change-in-production'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: configManager.getProperty('ngdpbase.session.max-age', 24 * 60 * 60 * 1000)
    }
  }));

  // Middleware to attach user context from session
  const debugSession = configManager.getProperty('ngdpbase.logging.debug.session', false);
  const debugRequests = configManager.getProperty('ngdpbase.logging.debug.requests', false);

  const userManager = engine.getManager('UserManager') as {
    getUser(username: string): Promise<{ isActive?: boolean; roles?: string[]; username?: string; [key: string]: unknown } | null>;
    getAnonymousUser(): NonNullable<Request['userContext']>;
    isAdminUsingDefaultPassword(): Promise<boolean>;
    resolveUserRoles(username: string): Promise<string[]>;
  };

  app.use((req: Request, _res: Response, next: NextFunction): void => {
    if (debugRequests) {
      console.log(`📨 ${req.method} ${req.url}`);
    }

    if (debugSession) {
      console.log('[SESSION-DEBUG] Session ID:', req.sessionID);
      console.log('[SESSION-DEBUG] Session data:', JSON.stringify(req.session));
      console.log('[SESSION-DEBUG] Session username:', req.session?.username);
    }

    void (async (): Promise<void> => {
      if (req.session?.username && req.session.isAuthenticated) {
        const user = await userManager.getUser(req.session.username);
        if (user?.isActive) {
          // #617 iteration 3a: source base roles from RoleManager (canonical
          // OrganizationRole records). Falls back to User.roles[] when no
          // RoleManager records exist. See UserManager.resolveUserRoles.
          const baseRoles = await userManager.resolveUserRoles(req.session.username);
          const roles = new Set(baseRoles);
          roles.add('Authenticated');
          roles.add('All');

          req.userContext = {
            ...user,
            roles: Array.from(roles),
            isAuthenticated: true,
            authenticated: true
          };
          logger.info(`[SESSION] Restored session for user: ${req.userContext.username}`);
        } else {
          req.userContext = userManager.getAnonymousUser();
          logger.info('[SESSION] User not found or inactive, treating as Anonymous');
        }
      } else {
        req.userContext = userManager.getAnonymousUser();
        logger.info('[SESSION] Restored session for user: Anonymous');
      }
      next();
    })();
  });

  // 5b. HTTP request duration metrics middleware
  const metricsManager = engine.getManager('MetricsManager') as {
    isEnabled(): boolean;
    getMetricsHandler(): ((req: Request, res: Response) => void) | null;
    recordHttpRequest(duration: number, meta: { method: string; route: string; status: string }): void;
  } | null;

  if (metricsManager?.isEnabled()) {
    app.use((req: Request, res: Response, next: NextFunction): void => {
      const start = Date.now();
      res.on('finish', () => {
        const routePath = (req.route as { path?: string } | undefined)?.path;
        const route = routePath ?? req.path
          .replace(/\/view\/[^/]+/, '/view/:page')
          .replace(/\/edit\/[^/]+/, '/edit/:page');
        metricsManager.recordHttpRequest(Date.now() - start, {
          method: req.method,
          route,
          status: String(res.statusCode)
        });
      });
      next();
    });
  }

  // 6. Admin-triggered maintenance mode middleware
  interface MaintenanceConfig {
    enabled?: boolean;
    allowAdmins?: boolean;
    message?: string;
    estimatedDuration?: string | null;
  }

  app.use((req: Request, res: Response, next: NextFunction): void => {
    const maintenanceCfg = (engine.config as unknown as { features?: { maintenance?: MaintenanceConfig } })
      ?.features?.maintenance;
    if (!maintenanceCfg?.enabled) { next(); return; }

    if (req.path.startsWith('/css') || req.path.startsWith('/js') ||
        req.path.startsWith('/images') || req.path === '/favicon.ico' ||
        req.path === '/favicon.svg' || req.path.startsWith('/admin') ||
        req.path.startsWith('/login') || req.path.startsWith('/logout')) {
      next(); return;
    }

    const allowAdmins = maintenanceCfg.allowAdmins !== false;
    const isAdmin = WikiContext.userHasRole(req.userContext, 'admin');
    if (allowAdmins && isAdmin) {
      next(); return;
    }

    res.status(503).render('maintenance', {
      message: maintenanceCfg.message ?? 'The system is currently under maintenance.',
      estimatedDuration: maintenanceCfg.estimatedDuration ?? null,
      notifications: [],
      allowAdmins,
      isAdmin
    });
  });

  // 6b. Initialize addons NOW — after session + userContext middleware — so addon
  //     route handlers can read req.session and req.userContext normally.
  await engine.initializeAddons();

  // 7. Register Routes
  const installRoutes = new InstallRoutes(engine);
  app.use('/install', installRoutes.getRouter());

  // 7b. /metrics — must be registered BEFORE wiki routes so it is not shadowed.
  //
  // Three cases:
  //   1. Admin or localhost → raw Prometheus text (also what Prometheus scrapers need)
  //   2. Browser non-admin → redirect to the wiki "Metrics" page if one exists, else 403
  //   3. Non-HTML Accept (e.g. Prometheus from a remote host) → raw data or 503
  //
  // Distinction: `/metrics` is always the Prometheus endpoint.
  //              The wiki Metrics page lives at `/view/Metrics` — a completely separate URL.
  app.get('/metrics', async (req: Request, res: Response): Promise<void> => {
    const isAdmin = WikiContext.userHasRole(req.userContext, 'admin');
    const ip = req.ip ?? '';
    const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    // Prometheus sends Accept headers that don't include text/html
    const wantsBrowserPage = !!req.accepts('html');

    const serveRaw = isAdmin || isLocalhost || !wantsBrowserPage;

    if (serveRaw) {
      if (!metricsManager?.isEnabled()) {
        res.status(503).send('Metrics not enabled'); return;
      }
      const metricsHandler = metricsManager.getMetricsHandler();
      if (!metricsHandler) {
        res.status(503).send('Metrics handler unavailable'); return;
      }
      metricsHandler(req, res);
      return;
    }

    // Browser request from non-admin: redirect to wiki Metrics page if one exists
    try {
      const pageManager = engine.getManager<PageManager>('PageManager');
      if (pageManager) {
        const metricsPage = await pageManager.getPageBySlug('metrics');
        if (metricsPage?.title) {
          res.redirect(`/view/${encodeURIComponent(metricsPage.title)}`);
          return;
        }
      }
    } catch { /* fall through to 403 */ }
    res.status(403).send('Admin access required');
  });

  const wikiRoutes = new WikiRoutes(engine);
  wikiRoutes.registerRoutes(app);

  // 8. Mark engine as ready
  engineReady = true;

  const port = process.env.PORT
    ? parseInt(process.env.PORT, 10)
    : configManager.getProperty('ngdpbase.server.port', 3000);
  const hostname = configManager.getProperty('ngdpbase.server.host', 'localhost');

  const externalPort = process.env.EXTERNAL_PORT ? parseInt(process.env.EXTERNAL_PORT) : port;
  const baseURL = `http://${hostname}:${externalPort}`;

  console.log('\n' + '='.repeat(60));
  if (externalPort !== port) {
    console.log(`🚀 Running ngdpbase on port ${port} (container internal)`);
    console.log(`🌐 External port: ${externalPort}`);
  } else {
    console.log(`🚀 ngdpbase Engine ready on port ${port}`);
  }
  console.log(`🌐 Visit: ${baseURL}`);

  const isDefaultPassword = await userManager.isAdminUsingDefaultPassword();
  if (isDefaultPassword) {
    const defaultPassword = configManager.getProperty('ngdpbase.user.security.defaultpassword', 'admin123');
    console.log(`⚠️  Use user 'admin' and password '${defaultPassword}' to login.`);
    console.log('⚠️  SECURITY WARNING: Change the admin password immediately!');
  }

  console.log('='.repeat(60) + '\n');
  logger.info(`Wiki engine ready, accepting requests at ${baseURL}`);

})();
