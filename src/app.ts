/**
 * @file src/app.ts
 * @description Main application entry point for the ngdpbase Engine.
 *
 * Compiled to dist/src/app.js — launched via `node dist/src/app.js` or ecosystem.config.js.
 * All project-root paths use process.cwd() rather than __dirname because
 * __dirname resolves to dist/src/ after compilation.
 */

// MUST stay first. Side-effecting module that loads .env into process.env;
// ES imports are hoisted, so this is the only reliable way to populate the
// environment before any other module's top-level code runs. See that file's
// header for why containers need it and how precedence works.
import { sessionSecretOrigin } from './bootstrap-env.js';

import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import fs from 'fs-extra';
import { constants as fsConstants } from 'fs';
import { runReadinessChecks, buildReadinessReport } from './utils/healthChecks.js';
import { resolveListenPort } from './utils/resolveListenPort.js';

import logger from './utils/logger.js';
import { resolveEgressPolicy } from './http/egressPolicy.js';
import { tokenGateRefusal } from './security/tokenRouteMap.js';
import { resolveMaintenanceState } from './utils/maintenanceState.js';
import { resolveTlsConfig } from './utils/tlsConfig.js';
import { createHttpsRedirectServer, routeSocket } from './utils/httpsRedirect.js';
import https from 'https';
import net from 'net';
import { gateDecision, describeBlocked } from './utils/startupState.js';
import WikiEngine from './WikiEngine.js';
import type { WikiEngine as IWikiEngine } from './types/WikiEngine.js';
import WikiRoutes from './routes/WikiRoutes.js';
import WikiContext from './context/WikiContext.js';
import InstallRoutes from './routes/InstallRoutes.js';
import InstallService from './services/InstallService.js';
import { ThemeManager } from './managers/ThemeManager.js';
import { resolveSessionSecurity } from './utils/sessionSecurity.js';
import { resolveSessionSecret } from './utils/sessionSecret.js';
import type PageManager from './managers/PageManager.js';

// Project root — reliable because PM2/server.sh always run from the project directory.
// __dirname would resolve to dist/src/ after compilation, so it cannot be used for
// views/, public/, themes/, addons/, .env, or the PID file.
const projectRoot = process.cwd();

// .env is loaded by the bootstrap-env import at the top of this file, which
// handles both the root file and <FAST_STORAGE>/.env with documented
// precedence. A second hand-rolled parser used to sit here (#1088); it could
// never fire — it assigned only when a variable was still unset, and
// bootstrap-env had already applied the same file — while reading as a
// competing source of truth.

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

/**
 * Read the merged configuration directly from disk, before the engine exists.
 *
 * `app.listen` runs at boot step 3 and `engine.initialize()` at step 4, so there
 * is no ConfigurationManager to ask when the socket is bound (#1090). This reads
 * the same two files the manager would, in the same order, purely so the listen
 * port can honour `ngdpbase.server.port`.
 *
 * Deliberately narrow: it does NOT resolve `${VAR}` refs or apply environment
 * overrides — that is the manager's job, and duplicating it here would be a
 * second config implementation. `resolveListenPort` skips any value it cannot
 * read as a port, which covers an unexpanded template.
 *
 * Returns null on any failure. A missing or malformed config file must not stop
 * the server binding; the port simply falls back.
 */
function readConfigForPort(): Record<string, unknown> | null {
  try {
    const instanceDataFolder =
      process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data';
    const customConfigFile = process.env.INSTANCE_CONFIG_FILE || 'app-custom-config.json';

    let merged: Record<string, unknown> = {};

    const defaultPath = path.join(projectRoot, 'config', 'app-default-config.json');
    if (fs.existsSync(defaultPath)) {
      merged = { ...(fs.readJsonSync(defaultPath) as Record<string, unknown>) };
    }

    const customPath = path.join(instanceDataFolder, 'config', customConfigFile);
    if (fs.existsSync(customPath)) {
      merged = { ...merged, ...(fs.readJsonSync(customPath) as Record<string, unknown>) };
    }

    return merged;
  } catch {
    return null;
  }
}

/**
 * Which keys the operator set themselves, as opposed to inheriting (#1163).
 *
 * `readConfigForPort()` returns the two files merged, which cannot answer
 * "did they configure this or is it the shipped default?" — and for the base
 * URL that difference decides whether a redirect is safe to issue. The shipped
 * value is `http://localhost:3000`; sending every visitor there would be worse
 * than the handshake error the redirect replaces.
 *
 * `ConfigurationManager.isBaseUrlExplicit()` (#642) makes the same distinction
 * for consumers that emit absolute URLs. This is the pre-engine equivalent,
 * needed because the socket is bound before the manager exists.
 */
function readCustomConfigKeys(): Set<string> | null {
  try {
    const instanceDataFolder =
      process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data';
    const customConfigFile = process.env.INSTANCE_CONFIG_FILE || 'app-custom-config.json';
    const customPath = path.join(instanceDataFolder, 'config', customConfigFile);
    if (!fs.existsSync(customPath)) return new Set();
    return new Set(Object.keys(fs.readJsonSync(customPath) as Record<string, unknown>));
  } catch {
    return null;
  }
}

// --- Main Application Bootstrap ---
void (async (): Promise<void> => {
  const app = express();
  let engine: IWikiEngine;
  let engineReady = false;
  // #1152: the second, independent fact the gate needs. Not a third readiness
  // value — the engine either finished or it did not — but whether it finished
  // and a configuration value turned out to be unusable, which is what decides
  // if /admin is reachable.
  let blockedReasons: string[] = [];
  // #1153: collected before the engine exists, so it cannot go through
  // engine.blockConfiguration() at the point it is found.
  let tlsBlockedReasons: string[] = [];

  // 1. Setup View Engine and static files first so we can serve the maintenance page
  app.set('views', path.join(projectRoot, 'views'));
  app.set('view engine', 'ejs');
  app.set('view cache', false);
  app.use(express.static(path.join(projectRoot, 'public')));
  app.use('/themes', express.static(path.join(projectRoot, 'themes')));
  app.use('/addons', express.static(path.join(projectRoot, 'addons')));

  // 1b. Health probes (#1079).
  //
  // Registered here — before the initialization gate, before session, CSRF and
  // userContext middleware, and before every route — for three reasons:
  //
  //   1. No session. `saveUninitialized: false` alone is not enough, because
  //      the CSRF middleware touches `req.session` on every request, which
  //      makes it initialized and writes a file. A probe running every 10s
  //      would fill ${FAST_STORAGE}/sessions with garbage.
  //   2. No maintenance gate. Behind it, liveness would answer 503 during
  //      boot and an orchestrator would restart a pod that is merely still
  //      indexing.
  //   3. No shadowing. A page slug named "health" cannot take these paths.
  //
  // They replace probing `/` (docker/k8s/deployment.yaml, docker/Dockerfile
  // HEALTHCHECK), which rendered a full page through auth, ACL and the
  // template layer on every check and accepted 200 *or* 302 — so an instance
  // that redirected everything read as healthy, while a slow render under
  // load failed the probe and pulled a pod that was only busy.

  // Liveness checks nothing, deliberately. If this cannot answer, the process
  // is wedged — the one condition a restart actually fixes. It answers during
  // startup too, so a slow boot is never mistaken for a hung process.
  app.get('/health/liveness', (_req: Request, res: Response): void => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness gates traffic: 503 removes the pod from rotation as a circuit
  // breaker without terminating it. While the engine is still initializing it
  // reports not-ready, which is precisely the "up but not yet serving" state
  // that probing `/` could not express.
  //
  // Deliberately narrow. SLOW_STORAGE, search and addons are real
  // dependencies, but cached pages and the admin UI still serve without them,
  // and pulling the pod would turn a partial outage into a total one.
  app.get('/health/readiness', async (_req: Request, res: Response): Promise<void> => {
    // #1152: readiness answers "can this instance serve traffic". A
    // configuration-blocked one cannot, and it would otherwise pass every
    // check below — engineRef is set and storage is fine. Reporting ready
    // while serving nobody is the defect #1079 removed.
    if (blockedReasons.length > 0) {
      res.status(503).json({
        status: 'not_ready',
        checks: { configuration: { ok: false, detail: blockedReasons } }
      });
      return;
    }

    const engineForCheck = engineRef;
    const results = engineForCheck
      ? await runReadinessChecks([
        {
          // Non-null provider means the engine finished wiring storage.
          name: 'pageProvider',
          run: () => !!(engineForCheck.getManager('PageManager') as {
            getCurrentPageProvider?: () => unknown;
          } | null)?.getCurrentPageProvider?.()
        },
        {
          // FAST_STORAGE holds sessions, config, logs and the page index.
          // Unwritable means the app is up but cannot serve a login.
          name: 'dataDirWritable',
          run: async () => {
            const dir = (engineForCheck.getManager('ConfigurationManager') as {
              getProperty?: (key: string) => unknown;
            } | null)?.getProperty?.('ngdpbase.directories.data') as string | undefined;
            if (!dir) return false;
            await fs.access(dir, fsConstants.W_OK);
            return true;
          }
        }
      ])
      : { engineInitialized: false };

    const report = buildReadinessReport(results);
    res.status(report.httpStatus).json({ status: report.status, checks: report.checks });
  });

  // 2. Initialization gate middleware — serves maintenance page while engine starts
  app.use((req: Request, res: Response, next: NextFunction): void => {
    const blocked = blockedReasons.length > 0;
    if (gateDecision(engineReady, blocked, req.path) === 'serve') { next(); return; }

    res.status(503).render('maintenance', {
      message: blocked
        ? describeBlocked(blockedReasons)
        : 'The system is starting up. This may take a moment while pages are indexed.',
      estimatedDuration: null,
      notifications: [],
      // Signals to the page that an administrator can sign in and repair this,
      // which is the difference between the two states that reach here.
      allowAdmins: blocked,
      isAdmin: false
    });
  });

  // 3. Start listening immediately so the server accepts connections during initialization
  // #1090: honour ngdpbase.server.port when neither PORT nor NGDPBASE_PORT is
  // set. Previously this read PORT alone and the config key was never consulted,
  // so the startup banner and the config screen could report a port the server
  // was not listening on.
  const defaultPort = resolveListenPort(process.env, readConfigForPort());

  // #1153: serve TLS ourselves when a certificate and key are configured. A
  // BROKEN configuration does not silently become HTTP — that is a transport
  // downgrade, where the operator configured TLS, believes traffic is
  // encrypted, and it is in the clear. It takes the #1152 survivable-failure
  // path instead, so the instance boots into maintenance mode naming the bad
  // file with /admin reachable.
  const tlsConfig = resolveTlsConfig((key, fallback) => readConfigForPort()?.[key] ?? fallback);
  let scheme: 'http' | 'https' = 'http';

  if (tlsConfig.mode === 'blocked') {
    tlsBlockedReasons = tlsConfig.reasons;
  } else if (tlsConfig.mode === 'https') {
    scheme = 'https';
    if (tlsConfig.expired) {
      // Deliberately still serving. Falling back would downgrade the transport
      // over a certificate that is merely stale, and blocking would take down
      // an instance whose operator may be mid-renewal — while a stale
      // certificate is already loudly visible to every client.
      logger.error(
        `🚨 The configured TLS certificate EXPIRED on ${tlsConfig.expiresAt}. ` +
        'Browsers will refuse to connect. Serving HTTPS anyway rather than downgrading to plain HTTP.'
      );
    }
  }

  if (scheme === 'https' && tlsConfig.mode === 'https') {
    const httpsServer = https.createServer({ cert: tlsConfig.cert, key: tlsConfig.key }, app);

    // #1163: a TLS listener owns the whole port, so an http:// request to it
    // gets a handshake error rather than anything a visitor can act on. Route
    // by the first byte instead — 0x16 is a TLS handshake, anything else is
    // plaintext and gets a 301 to the https URL. No new configuration: TLS
    // being configured IS the enable condition.
    const redirectServer = createHttpsRedirectServer({
      configuredBaseUrl: () => {
        // Explicit only. The shipped default is http://localhost:3000, and
        // redirecting every visitor to localhost would be worse than the
        // handshake error this replaces (#642 draws the same distinction).
        const cfg = readConfigForPort();
        const custom = readCustomConfigKeys();
        const explicit = process.env.NGDPBASE_BASE_URL
          || (custom?.has('ngdpbase.application.base-url')
            ? (cfg?.['ngdpbase.application.base-url'] as string | undefined)
            : undefined);
        return explicit ?? null;
      },
      onRedirect: (from, to) => logger.debug(`[https-redirect] ${from} -> ${to}`)
    });

    net.createServer((socket) => routeSocket(socket, {
      tls: httpsServer,
      plain: redirectServer,
      onError: (err) => logger.debug(`[https-redirect] socket error before routing: ${err.message}`)
    })).listen(defaultPort, () => {
      console.log(
        `🚀 Server listening on port ${defaultPort} over HTTPS (initializing engine...)`
      );
      console.log('🔁 Plain HTTP on this port is redirected to HTTPS (#1163)');
    });
  } else {
    app.listen(defaultPort, () => {
      console.log(`🚀 Server listening on port ${defaultPort} over HTTP (initializing engine...)`);
    });
  }

  // 4. Initialize the WikiEngine
  try {
    console.log('🚀 Initializing ngdpbase Engine...');
    engine = new WikiEngine();
    engine.app = app; // expose Express app to add-ons before initialization (#359)
    await engine.initialize();
    engineRef = engine;

    // #1133: reconcile the outbound CIDR lists HERE, at boot. Deferring it to
    // the first fetch would surface a contradictory configuration as one
    // dropped image with a `fetch` warning — indistinguishable from the remote
    // host being down.
    //
    // #1144: nothing here stops the boot any more. Contradictions resolve by
    // firewall convention (D8) and are reported; a malformed range, the one
    // case with no safe silent resolution, is surfaced for #1152 to turn into
    // a maintenance boot with a route to the fix.
    const egressCm = engine.getManager<import('./managers/ConfigurationManager.js').default>('ConfigurationManager');
    const egress = resolveEgressPolicy((key, fallback) => egressCm?.getProperty?.(key, fallback));
    if (egress.conflicts.length > 0) {
      for (const conflict of egress.conflicts) {
        logger.warn(`⚠️  [egress] ${conflict}`);
      }
      logger.warn('[egress] the boundary is still enforced; overlaps resolved with the deny winning');
    }
    if (egress.malformed.length > 0) {
      // The case that can fail OPEN: an operator wrote a deny rule, it did not
      // parse, and nothing about the running instance looks wrong. #1152 makes
      // it block serving rather than only warn, because a restriction somebody
      // wrote and believes is in force must not silently not be.
      engine.blockConfiguration(
        `${egress.malformed.length} outbound range(s) do not parse as CIDR and are NOT in force: ` +
        `${egress.malformed.join(', ')}. A malformed deny rule means the restriction you wrote is not applied. ` +
        'Fix ngdpbase.security.egress.denied-ranges / allowed-ranges.'
      );
    }

    // #1152: a configuration value an administrator can repair does not kill
    // the process. The engine finished, so the admin screens work; the
    // instance serves them and refuses everything else until the value is
    // fixed.
    for (const reason of tlsBlockedReasons) engine.blockConfiguration(reason);
    blockedReasons = [...engine.getBlockingConditions()];
    if (blockedReasons.length > 0) {
      logger.error(`🚨 ${describeBlocked(blockedReasons)}`);
      logger.error(
        '[startup] The instance is NOT serving content. Sign in at /admin to repair the configuration, then restart.'
      );
    }

    console.log('✅ ngdpbase Engine initialized successfully.');
  } catch (error) {
    // Still fatal: reaching here means the machinery needed to SERVE the
    // repair UI is itself unavailable — ConfigurationManager, the user and
    // session layer, or the data directory. A process that stays up pretending
    // otherwise is worse than one that stops, because there is no way out to
    // offer (D10).
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
    // #1043: needed to tell an operator's explicit choice apart from the
    // shipped default, which pins session.secure to false.
    getCustomProperties(): Record<string, unknown>;
  };

  // #861: behind a reverse proxy / Cloudflare Tunnel every request reaches Express
  // from localhost, so req.ip is 127.0.0.1 — collapsing the share rate limiter's
  // `token:ip` buckets and recording the tunnel's IP in audit rows. When enabled,
  // Express derives req.ip from X-Forwarded-For. Accepts Express's native values:
  // 'loopback', a hop count, or a subnet list. Off unless configured — or unless
  // the session cookie is `secure`, in which case #1046 derives it, because
  // `secure` without `trust proxy` cannot issue a cookie behind terminated TLS.
  //
  // Resolved with the cookie flag, before the session middleware is built.
  const sessionSecurity = resolveSessionSecurity(
    configManager.getCustomProperties(),
    process.env.NODE_ENV,
    // #1160: whether THIS server terminates TLS. The derivation of `trust
    // proxy` from `secure` assumed TLS was terminated upstream; with native
    // TLS there is no proxy, and trusting a forwarded header nothing sets is
    // worse than not trusting it.
    { nativeTls: scheme === 'https' }
  );
  if (sessionSecurity.trustProxy !== false) {
    app.set('trust proxy', sessionSecurity.trustProxy);
    const origin = sessionSecurity.trustProxyDerived ? ' (derived from session.secure)' : '';
    console.log(`🔒 trust proxy enabled: ${JSON.stringify(sessionSecurity.trustProxy)}${origin}`);
  }
  if (sessionSecurity.misconfigured) {
    logger.warn(
      '⚠️  ngdpbase.session.secure is on while ngdpbase.server.trust-proxy is explicitly false. ' +
      'Behind TLS terminated upstream, Express sees plain http and express-session will NOT send ' +
      'the session cookie — every state-changing POST then fails as "Forbidden — invalid CSRF token" ' +
      'and login is impossible (#1046). Remove the trust-proxy override, or set it to a hop count ' +
      'or subnet list matching your proxy.'
    );
  }

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

  // #1043: `secure` was hardcoded false, so the session cookie shipped without
  // the flag on every HTTPS deployment, and the documented
  // `ngdpbase.session.secure` key did nothing at all.
  //
  // The key cannot simply be read with a NODE_ENV default: the shipped
  // app-default-config.json pins it to `false`, so getProperty() always returns
  // that and the default never applies. A first cut did exactly this and the
  // container smoke test came up `secure=false` under NODE_ENV=production —
  // the fix would have shipped doing nothing.
  //
  // So the OPERATOR's explicit choice (custom config) wins, and in its absence
  // production turns it on. Behind a TLS-terminating proxy the app sees plain
  // http while the browser is on https, which is exactly the case where the
  // flag must still be set — inferring it from the request would get that wrong.
  //
  // #1046: resolved above alongside `trust proxy`, which has to be set for this
  // flag to be survivable behind terminated TLS. See resolveSessionSecurity().
  const sessionSecure = sessionSecurity.secure;
  const sessionHttpOnly = Boolean(configManager.getProperty('ngdpbase.session.http-only', true));
  logger.info(
    `🔐 Session cookie: secure=${sessionSecure} httpOnly=${sessionHttpOnly} sameSite=lax ` +
    `trustProxy=${JSON.stringify(sessionSecurity.trustProxy)}`
  );
  if (sessionSecretOrigin.kind === 'generated') {
    logger.warn(
      '🔐 Session secret was not set. Generated one and wrote NGDPBASE_SESSION_SECRET to ' +
      `${sessionSecretOrigin.path} (#1194). Sessions survive restarts as long as that file does.`
    );
  } else if (sessionSecretOrigin.kind === 'instance-env-file') {
    logger.info(`🔐 Session secret: from ${sessionSecretOrigin.path} (the environment had it blank)`);
  }

  app.use(session({
    store: new FileStore({
      path: sessionPath,
      ttl: configManager.getProperty('ngdpbase.session.max-age', 24 * 60 * 60 * 1000) / 1000,
      retries: 0,
      reapInterval: 3600
    }),
    // #1194: the ONLY reader of the session secret. bootstrap-env.ts made
    // NGDPBASE_SESSION_SECRET true (from the environment, the instance .env,
    // or by generating and backfilling it) or exited; this re-check is the
    // guard against a later import clearing it. Never the config key, whose
    // shipped value is a public literal.
    secret: resolveSessionSecret(process.env),
    resave: false,
    saveUninitialized: false,
    cookie: {
      // #1043: `secure` used to be hardcoded false, so the session cookie went
      // out without the flag on every HTTPS deployment — and the documented
      // `ngdpbase.session.secure` key did nothing at all, which is worse than
      // not offering it.
      //
      // Defaults to on in production and off otherwise, so the containers are
      // correct out of the box while http://localhost development still works.
      // An explicit config value wins either way.
      secure: sessionSecure,
      httpOnly: sessionHttpOnly,
      // Was unset, leaving it to browser defaults. 'lax' keeps ordinary
      // top-level navigation working while refusing the cookie on cross-site
      // POSTs — defence in depth behind the CSRF middleware, not a replacement.
      sameSite: 'lax',
      maxAge: configManager.getProperty('ngdpbase.session.max-age', 24 * 60 * 60 * 1000)
    }
  }));

  // #776/#777 follow-up: capture req.ip into the session on first write so the
  // admin Session Manager can display it. Only writes when the session exists
  // and doesn't already have an ip — avoids triggering a session save on every
  // request (which would be expensive for the file store).
  app.use((req, _res, next) => {
    if (req.session && !(req.session as unknown as { ip?: string }).ip && req.ip) {
      (req.session as unknown as { ip?: string }).ip = req.ip;
    }
    next();
  });

  // #649 — Cloudflare Access JWT trust. When the request carries a
  // `Cf-Access-Jwt-Assertion` header AND the provider is registered AND the
  // session doesn't already identify a user, verify the JWT via AuthManager
  // and populate req.session.username. The existing user-context middleware
  // below then resolves the user the normal way. No-ops in the common case
  // (header absent, provider disabled, or session already authenticated).
  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.headers['cf-access-jwt-assertion'];
      if (!token || typeof token !== 'string') { next(); return; }
      if (req.session?.username) { next(); return; }
      const authManager = engine.getManager('AuthManager') as {
        authenticate?: (id: string, creds: { token?: string }) => Promise<{ success: boolean; username?: string }>;
        getProviders?: () => Array<{ id: string }>;
      } | null;
      const hasCf = authManager?.getProviders?.().some(p => p.id === 'cloudflare-access');
      if (!authManager?.authenticate || !hasCf) { next(); return; }
      const result = await authManager.authenticate('cloudflare-access', { token });
      if (result.success && result.username && req.session) {
        req.session.username = result.username;
      }
    } catch (err) {
      logger.warn('[CloudflareAccess middleware] failed:', err);
    }
    next();
  });

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

  // #818 / #946 — bearer trust for API clients. Runs AFTER the
  // session/userContext middleware so it can override the default Anonymous
  // context with the token's identity. Stateless: no session is created for
  // API calls (agents present a token per request). Marks `req.bearerAuth` so
  // the CSRF middleware skips bearer-authenticated requests (bearer auth is not
  // cookie-based and therefore not CSRF-susceptible). No-ops when the header is
  // absent or no bearer provider is enabled.
  //
  // #946: this previously hardcoded 'authentik-bearer', so a second bearer
  // provider would never be consulted. It now tries each registered
  // bearer-capable provider in turn and takes the first success, letting the
  // in-app agent-token provider and Authentik coexist (or run alone, or
  // neither).
  const BEARER_PROVIDER_IDS = ['authentik-bearer', 'agent-token'];
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.headers['authorization'];
      if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) { next(); return; }
      const authManager = engine.getManager('AuthManager') as {
        authenticate?: (id: string, creds: { token?: string }) => Promise<{
          success: boolean;
          username?: string;
          viaToken?: { id: string; name: string; scopes: string[] };
        }>;
        getProviders?: () => Array<{ id: string }>;
      } | null;
      const registered = new Set((authManager?.getProviders?.() ?? []).map(p => p.id));
      const candidates = BEARER_PROVIDER_IDS.filter(id => registered.has(id));
      const token = header.slice('Bearer '.length).trim();

      // #981: an ngdp_at_ token is unambiguously an agent token. If it cannot
      // be authenticated — feature disabled, provider unregistered, token
      // revoked or expired — say THAT, rather than falling through to the CSRF
      // guard and answering `Forbidden — invalid CSRF token`. The old
      // behaviour sent operators debugging CSRF configuration over a token
      // problem, which is about as misleading as an error can be.
      const looksLikeAgentToken = token.startsWith('ngdp_at_');
      const rejectAgentToken = (reason: string): void => {
        logger.warn(`[bearer] rejected agent token — ${reason}`);
        res.status(401).json({
          success: false,
          error: 'Invalid or unusable agent token',
          message: reason
        });
      };

      if (!authManager?.authenticate || candidates.length === 0) {
        if (looksLikeAgentToken) {
          rejectAgentToken(
            'agent tokens are not enabled on this instance (ngdpbase.auth.agent-token.enabled)'
          );
          return;
        }
        next();
        return;
      }
      if (!token) { next(); return; }

      let result: { success: boolean; username?: string; viaToken?: { id: string; name: string; scopes: string[] } } = { success: false };
      let matchedProvider = '';
      for (const providerId of candidates) {
        const attempt = await authManager.authenticate(providerId, { token });
        if (attempt.success && attempt.username) {
          result = attempt;
          matchedProvider = providerId;
          break;
        }
      }
      if (result.success && result.username) {
        const user = await userManager.getUser(result.username);
        if (user?.isActive) {
          const baseRoles = await userManager.resolveUserRoles(result.username);
          const roles = new Set(baseRoles);
          roles.add('Authenticated');
          roles.add('All');
          req.userContext = {
            ...user,
            roles: Array.from(roles),
            isAuthenticated: true,
            authenticated: true,
            // #946: scopes ride on userContext so they reach both the ACL
            // scope gate and the save path (for via-token provenance) through
            // the WikiContext the route handler already builds. Roles above are
            // resolved live per request — a token never carries a snapshot.
            ...(result.viaToken ? { viaToken: result.viaToken } : {})
          };
          (req as Request & { bearerAuth?: boolean }).bearerAuth = true;
          logger.info(`[bearer:${matchedProvider}] Authenticated API request as: ${result.username}`);

          // #1173 Part A — the edge gate. Every token-bearing request passes
          // here, and this is the only place that knows the token before a
          // route handler runs, so the reach decision belongs here rather than
          // in a layer of its own.
          //
          // The scope ceiling in hasPermission answers "may this token DO
          // this", and only when a handler asks. This answers "may it reach
          // this at all", which is a different question: POST /api/tokens
          // checks isAuthenticated and never calls hasPermission, so the
          // ceiling has nothing to run inside of and a page-read token could
          // mint a page-delete one.
          //
          // Deliberately NOT applied to session requests — the guard is inside
          // the `result.viaToken` branch, so a browser is unaffected by
          // construction rather than by a check somebody has to maintain.
          if (result.viaToken) {
            const refusal = tokenGateRefusal(req.method, req.path, result.viaToken.scopes);
            if (refusal) {
              logger.warn(
                `[bearer:gate] token ${result.viaToken.id} ("${result.viaToken.name}") refused — ` +
                `${refusal.reason}: ${refusal.message}`
              );
              res.status(403).json(refusal);
              return;
            }
          }
        }
      }

      // #981: same reasoning as above, for a token that reached a registered
      // provider and was still refused.
      if (!(req as Request & { bearerAuth?: boolean }).bearerAuth && looksLikeAgentToken) {
        rejectAgentToken('token is invalid, revoked, expired, or its owner is inactive');
        return;
      }
    } catch (err) {
      logger.warn('[bearer middleware] failed:', err);
    }
    next();
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
  //
  // #1147: this read `engine.config.features.maintenance` — an in-memory
  // object that configuration never populated, so the documented
  // `ngdpbase.features.maintenance.enabled` key did not gate the site and only
  // the admin toggle (which mutated that object and never persisted it) could
  // turn maintenance on. It now resolves through the same helper as
  // ACLManager, which is what makes one switch mean one state.
  //
  // Resolved per request rather than captured here, so the toggle takes effect
  // immediately and closing or reopening an instance needs no restart.
  app.use((req: Request, res: Response, next: NextFunction): void => {
    const maintenanceCm = engine.getManager<import('./managers/ConfigurationManager.js').default>('ConfigurationManager');
    const maintenance = resolveMaintenanceState(
      (key, fallback) => maintenanceCm?.getProperty?.(key, fallback)
    );
    if (!maintenance.enabled) { next(); return; }

    if (req.path.startsWith('/css') || req.path.startsWith('/js') ||
        req.path.startsWith('/images') || req.path === '/favicon.ico' ||
        req.path === '/favicon.svg' || req.path.startsWith('/admin') ||
        req.path.startsWith('/login') || req.path.startsWith('/logout')) {
      next(); return;
    }

    const isAdmin = WikiContext.userHasRole(req.userContext, 'admin');
    if (maintenance.allowAdmins && isAdmin) {
      next(); return;
    }

    res.status(503).render('maintenance', {
      message: maintenance.message,
      estimatedDuration: maintenance.estimatedDuration,
      notifications: [],
      allowAdmins: maintenance.allowAdmins,
      isAdmin
    });
  });

  // 6b. CSRF middleware (#663) — issues a per-session token and validates it
  //     on every state-changing request. Must run AFTER session + userContext
  //     so it can read req.session, and BEFORE any route registration.
  //     Templates surface the token via getCommonTemplateData() as `csrfToken`;
  //     forms render `<input name="_csrf" value="<%= csrfToken %>">`;
  //     JS-driven fetches submit it via the `X-CSRF-Token` header.
  const { csrfMiddleware } = await import('./middleware/csrf.js');
  app.use(csrfMiddleware);

  // 6c. Initialize addons NOW — after session + userContext + CSRF middleware
  //     — so addon route handlers can read req.session and req.userContext
  //     normally and inherit CSRF protection on their own POST routes.
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
  // #1152: an instance with an unusable configuration value never becomes
  // ready. It serves the maintenance page and the repair screens, nothing else.
  if (blockedReasons.length === 0) {
    engineReady = true;
  }

  // #1090: the same resolution app.listen used, so the banner and base URL
  // report the port actually bound. This used to be an independent expression
  // that could disagree with it.
  const port = defaultPort;
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

  // The password itself is never echoed. It used to be, because it was the
  // shipped, publicly-known 'admin123' and printing it gave away nothing.
  // ngdpbase no longer ships a default: every bootstrap password is now
  // operator-supplied, so echoing one would write a live credential into the
  // logs — and /admin/logs is readable by anyone holding `admin-read`, which
  // is exactly what the read-only demo role grants (#1029).
  const isDefaultPassword = await userManager.isAdminUsingDefaultPassword();
  if (isDefaultPassword) {
    console.log('⚠️  The admin account is still using the bootstrap password from');
    console.log("⚠️  'ngdpbase.user.security.defaultpassword' (NGDPBASE_ADMIN_PASSWORD).");
    console.log('⚠️  Change it, or rotate that value.');
  }

  console.log('='.repeat(60) + '\n');
  logger.info(`Wiki engine ready, accepting requests at ${baseURL}`);

})();
