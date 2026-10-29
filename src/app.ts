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
import { ANONYMOUS_SUBJECT } from './managers/UserManager.js';
import { AUDIT_EVENT } from './utils/auditEventNames.js';
import { recordSystemAction, systemContext } from './context/bootActions.js';
import { subjectMayDo } from './utils/subjectMayDo.js';

import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import fs from 'fs-extra';
import { constants as fsConstants } from 'fs';
import { runReadinessChecks, buildReadinessReport, instanceDataFolderWritable, type ReadinessReport } from './utils/healthChecks.js';
import { resolveListenPort } from './utils/resolveListenPort.js';
import { loadMergedConfigSync } from './utils/addonConfigLayer.js';

import logger from './utils/logger.js';
import { resolveEgressPolicy } from './http/egressPolicy.js';
import { tokenGateRefusal } from './security/tokenRouteMap.js';
import { resolveAvailability } from './utils/availability.js';
import { ENV_KEYS_CONFIG_KEY } from './utils/configEnvKeys.js';
import { resolveTlsConfig } from './utils/tlsConfig.js';
import { createHttpsRedirectServer, routeSocket } from './utils/httpsRedirect.js';
import https from 'https';
import net from 'net';
import { initialisationGate, describeBlocked } from './utils/startupState.js';
import { systemPrincipalFromConfig } from './security/PolicyInformationPoint.js';
import WikiEngine from './WikiEngine.js';
import type { WikiEngine as IWikiEngine } from './types/WikiEngine.js';
import WikiRoutes from './routes/WikiRoutes.js';
import InstallRoutes from './routes/InstallRoutes.js';
import InstallService from './services/InstallService.js';
import { ThemeManager } from './managers/ThemeManager.js';
import { resolveSessionSecurity, sessionCookieWithheld } from './utils/sessionSecurity.js';
import { resolveSessionSecret } from './utils/sessionSecret.js';
import { pageUrl } from './utils/pageUrl.js';
import { jsonForScript } from './utils/jsonForScript.js';
import { securityHeaders, cspModeOf, newCspNonce } from './utils/securityHeaders.js';
import { checkSessionAccount, type AccountEndReason } from './utils/sessionAccount.js';
import { effectiveIdleTimeoutMs, IDLE_STATUS_PATH } from './utils/sessionIdle.js';
import { anonymousSessionMs, checkSessionLimits, DEFAULT_ANONYMOUS_SESSION_MS, DEFAULT_SESSION_MAX_AGE_MS, sessionCapMs } from './utils/sessionLimits.js';
import { throttlePerCopyWarning } from './utils/LoginThrottle.js';
import { sweepOrphanedKeys } from './utils/privateStoreUnlock.js';
import { endSession, type SessionEndReason } from './utils/sessionEnd.js';
import type PageManager from './managers/PageManager.js';
import type BackgroundJobManager from './managers/BackgroundJobManager.js';
import { OIDC_INTERACTION_PREFIX, OIDC_MOUNT, type OidcManager } from './managers/OidcManager.js';
import { registerOidcRoutes } from './routes/OidcRoutes.js';
import { bearerProviderIds } from './utils/bearerProviders.js';
import { pidLockPath } from './utils/pidLock.js';
import { isDawarichApiKeyPath } from './routes/DawarichCompatRoutes.js';

// Project root — reliable because PM2/server.sh always run from the project directory.
// __dirname would resolve to dist/src/ after compilation, so it cannot be used for
// views/, public/, themes/, addons/ or .env.
const projectRoot = process.cwd();

// .env is loaded by the bootstrap-env import at the top of this file, which
// handles both the root file and <FAST_STORAGE>/.env with documented
// precedence. A second hand-rolled parser used to sit here (#1088); it could
// never fire — it assigned only when a variable was still unset, and
// bootstrap-env had already applied the same file — while reading as a
// competing source of truth.

// --- PID File Lock to Prevent Multiple Instances ---
// #1687: in the temp directory, named per checkout — the checkout itself is
// root-owned in the image, so a non-root server could not start.
const PID_FILE = pidLockPath(projectRoot);
/** How often unlocked keys of ended sessions are swept (#1626). */
const ORPHANED_KEY_SWEEP_MS = 10 * 60 * 1000;
/** Why a session no longer belongs to its account, for the log line (#1937, #1482). */
const ACCOUNT_END_WHY: Record<AccountEndReason, string> = {
  'account-deleted': 'the account it signed in to no longer exists (#1937)',
  'account-disabled': 'the account is turned off (#1937)',
  'password-changed': 'the password changed after this session signed in (#1482)'
};

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
 * The merged configuration, before the engine exists.
 *
 * `app.listen` runs at boot step 3 and `engine.initialize()` at step 4, so
 * there is no ConfigurationManager to ask when the socket is bound (#1090).
 * #1214: this is the manager's own read and merge (src/utils/configFiles.ts),
 * not a second one — the earlier shallow spread here would have replaced a
 * whole map on override. It still does not resolve `${VAR}` refs, apply
 * env-key overrides, or run the legacy-key migrations; the pre-engine callers
 * skip any value they cannot use, and a base URL set under a legacy key is
 * not seen as explicit here.
 *
 * Returns null on any failure. A missing or malformed config file must not
 * stop the server binding; the port simply falls back.
 */
function readConfigForPort(): Record<string, unknown> | null {
  return loadMergedConfigSync()?.merged ?? null;
}

/**
 * The site's name from the configuration files and the environment, for the
 * maintenance page while ConfigurationManager is not up yet (#1906, #1878).
 * Read once at boot; `ConfigurationManager.getApplicationName()` answers after.
 */
function siteNameFromFiles(merged: Record<string, unknown> | null): string {
  const envVar = (merged?.[ENV_KEYS_CONFIG_KEY] as Record<string, string> | undefined)?.['ngdpbase.application-name'];
  const fromEnv = envVar ? process.env[envVar] : undefined;
  const name = fromEnv || merged?.['ngdpbase.application-name'];
  // A "$VAR" reference is not resolved here; showing it would name nothing.
  return typeof name === 'string' && !name.startsWith('$') ? name : '';
}

/**
 * Which keys the operator set themselves, as opposed to inheriting (#1163).
 *
 * The merged view cannot answer "did they configure this or is it the
 * shipped default?" — and for the base URL that difference decides whether a
 * redirect is safe to issue. `ConfigurationManager.isBaseUrlExplicit()` (#642)
 * makes the same distinction after the engine exists.
 */
function readCustomConfigKeys(): Set<string> | null {
  return loadMergedConfigSync()?.customKeys ?? null;
}

// --- Main Application Bootstrap ---
void (async (): Promise<void> => {
  const app = express();
  let engine: IWikiEngine;
  let engineReady = false;
  // #1153: collected before the engine exists, so it cannot go through
  // engine.maintenance.enter() at the point it is found.
  let tlsBlockedReasons: string[] = [];
  // #1906: the site's name for the maintenance page before ConfigurationManager
  // is up (the "starting" page); afterwards it is asked for per request.
  const startingSiteName = siteNameFromFiles(readConfigForPort());

  // #1488: browser security headers on every response, static files and the
  // maintenance page included, so this runs first. The mode is read from
  // configuration once the engine is up; until then it is the shipped default.
  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    // #1703: a fresh nonce per response. Every inline <script> in the views
    // carries it (`nonce="<%= locals.cspNonce %>"`), so a strict script-src
    // (#1705) can allow exactly those and refuse an injected one.
    res.locals.cspNonce = newCspNonce();
    const configured = engineReady
      ? engine.getManager<{ getProperty(key: string, fallback: unknown): unknown }>('ConfigurationManager')
        ?.getProperty('ngdpbase.security.headers.csp-mode', 'report-only')
      : 'report-only';
    for (const [name, value] of Object.entries(securityHeaders(cspModeOf(configured)))) res.setHeader(name, value);
    next();
  });

  // 1. Setup View Engine and static files first so we can serve the maintenance page
  app.set('views', path.join(projectRoot, 'views'));
  app.set('view engine', 'ejs');
  app.set('view cache', false);
  // #1456: every view builds a page's links with the function the routes use —
  // a private page's actions live under /vaults/.
  app.locals.pageUrl = pageUrl;
  // Data written into a <script> by a view goes through this, never a bare
  // JSON.stringify: a string holding `</script>` would end the element.
  app.locals.jsonForScript = jsonForScript;
  // #1468: the keyword normaliser the server runs, for the browser's keyword
  // field (public/js/keyword-typeahead.js imports it) — its compiled output,
  // not a retyped copy. No imports of its own, so it loads as it is.
  app.get('/js/shared/keyword-normalizer.js', (_req: Request, res: Response) => {
    res.type('application/javascript');
    res.sendFile(path.join(projectRoot, 'dist', 'src', 'utils', 'keywordNormalizer.js'));
  });
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
    // #1906: only what visitors are told — never a reason, which is for
    // administrators. The admin switch does not pull the instance: nothing is
    // broken, and the maintenance page must stay reachable.
    if (engineRef?.maintenance.isClosedToAdmins()) {
      const view = engineRef.maintenance.visitorView(engineRef.getManager('ConfigurationManager'));
      res.status(503).json({
        status: 'not-ready' satisfies ReadinessReport['status'],
        checks: { configuration: { ok: false, detail: [view?.message ?? ''] } }
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
          run: () => instanceDataFolderWritable(
            engineForCheck.getManager('ConfigurationManager'),
            (dir) => fs.access(dir, fsConstants.W_OK)
          )
        }
      ])
      : { engineInitialized: false };

    const report = buildReadinessReport(results);
    res.status(report.httpStatus).json({ status: report.status, checks: report.checks });
  });

  // 2. Initialization gate middleware — serves maintenance page while engine starts
  //
  // #1906: a failure held in maintenance mode (`engine.maintenance`, entered
  // by a manager) closes everything but /admin, /login and /logout, for
  // administrators too — read per request, so leave() reopens the site.
  app.use((req: Request, res: Response, next: NextFunction): void => {
    if (initialisationGate(engineReady, engineRef?.maintenance, req.path) === 'serve') { next(); return; }
    const blocked = engineRef?.maintenance.isClosedToAdmins() ?? false;

    const configManager = engineRef?.getManager<import('./managers/ConfigurationManager.js').default>('ConfigurationManager');
    const view = blocked ? engineRef?.maintenance.visitorView(configManager) : null;
    res.status(503).render('maintenance', {
      message: view
        ? view.message
        : 'The system is starting up. This may take a moment while pages are indexed.',
      estimatedDuration: view?.estimatedDuration ?? null,
      siteName: configManager?.getApplicationName?.() ?? startingSiteName,
      notifications: [],
      // #1432: which state closed it. Neither of the two that reach here is
      // maintenance, and the page used to announce both as maintenance — an
      // instance that cannot boot told the operator it was being worked on.
      reason: blocked ? 'misconfigured' : 'starting',
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
      engine.maintenance.enter(
        `${egress.malformed.length} outbound range(s) do not parse as CIDR and are NOT in force: ` +
        `${egress.malformed.join(', ')}. A malformed deny rule means the restriction you wrote is not applied. ` +
        'Fix ngdpbase.security.egress.denied-ranges / allowed-ranges.'
      );
    }

    // #1152: a configuration value an administrator can repair does not kill
    // the process. The engine finished, so the admin screens work; the
    // instance serves them and refuses everything else until the value is
    // fixed.
    for (const reason of tlsBlockedReasons) engine.maintenance.enter(reason);
    const bootReasons = engine.maintenance.reasons();
    // #1147/#1906: the admin switch, left on before a restart, holds again.
    engine.maintenance.restoreSwitch(egressCm);
    if (bootReasons.length > 0) {
      logger.error(`🚨 ${describeBlocked(bootReasons)}`);
      logger.error(
        '[startup] The instance is NOT serving content. Sign in at /admin to repair the configuration, then restart.'
      );
    }

    // #2117: share links on a public origin, with TLS terminated here. One
    // warning; whether a tunnel or proxy is in front cannot be seen from here.
    const shareTlsWarning = engine.getManager<import('./managers/ShareManager.js').default>('ShareManager')
      ?.publicOriginTlsWarning(scheme === 'https');
    if (shareTlsWarning) logger.warn(`⚠️  [share] ${shareTlsWarning}`);

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

  // #1570: the OpenID Connect provider at /oidc, mounted BEFORE the body
  // parsers, the session and CSRF. node-oidc-provider reads the raw body
  // itself, and its protocol endpoints answer machine clients with their own
  // protections (PKCE, client authentication, the device pages' xsrf), so CSRF
  // never sees them and needs no exemption list (#1573). ngdpbase's own
  // sign-in and consent route, /oidc/interaction/*, is passed on: it needs the
  // session and keeps CSRF. Mounted only when the manager is configured; the
  // server itself starts once `trust proxy` is resolved below.
  const oidcManager = engine.getManager<OidcManager>('OidcManager');
  let oidcHandler: ((req: Request, res: Response) => Promise<void>) | null = null;
  if (oidcManager?.getIssuer()) {
    app.use(OIDC_MOUNT, (req: Request, res: Response, next: NextFunction) => {
      if (!oidcHandler || req.url.startsWith(OIDC_INTERACTION_PREFIX)) { next(); return; }
      oidcHandler(req, res).catch(next);
    });
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // #1743 slice 4b: a provider that POSTs its callback (Apple's form_post) is
  // relayed to the GET callback here, BEFORE the session and CSRF: the
  // cross-site POST carries none of this site's SameSite=Lax cookies, and a
  // session started for it would replace the person's own. Only providers
  // AuthManager says POST their callback; any other POST falls through to CSRF.
  const { outsideCallbackRelay, OUTSIDE_CALLBACK_PATH } = await import('./middleware/outsideCallbackRelay.js');
  app.post(OUTSIDE_CALLBACK_PATH, outsideCallbackRelay((providerId) =>
    engine.getManager<{ callbackIsPosted(id: string): boolean }>('AuthManager')?.callbackIsPosted(providerId) ?? false));

  app.use(cookieParser());

  // Install check middleware
  const installService = new InstallService(engine);
  const headlessInstall = process.env.HEADLESS_INSTALL === 'true';
  await installService.markExistingSiteInstalled(); // #1410

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
  // #1574: the provider believes X-Forwarded-* exactly when Express does —
  // one decision, made once, for both.
  oidcHandler = oidcManager?.start({ trustProxy: sessionSecurity.trustProxy !== false }) ?? null;
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
    // #1197: the instance changed its own configuration on disk. Recorded as a
    // config-change under the system principal, origin boot — the sink is up
    // by now, so this records directly.
    void recordSystemAction(engine, systemContext(engine, 'generate the session secret and write it to the instance .env (#1194)'), {
      eventType: AUDIT_EVENT.CONFIG_CHANGE,
      action: 'generate',
      resource: 'NGDPBASE_SESSION_SECRET',
      resourceType: 'config',
      result: 'success',
      severity: 'medium',
      metadata: { path: sessionSecretOrigin.path, valueRecorded: false }
    });
  } else if (sessionSecretOrigin.kind === 'instance-env-file') {
    logger.info(`🔐 Session secret: from ${sessionSecretOrigin.path} (the environment had it blank)`);
  }

  // #631: the system principal is named in .env and nowhere else. The refusal
  // when it is unset is WikiEngine.initialize's, right after configuration
  // loads and before any manager writes (#1953); by here it is known good.
  logger.info(`🔐 System principal: ${systemPrincipalFromConfig(configManager)} (NGDPBASE_SYSTEM_USER)`);

  // #1767: sign-in throttling counts in this process's memory. Several copies
  // of the server each count separately, so say so once at startup.
  const throttleWarning = throttlePerCopyWarning(process.env, configManager.getProperty<unknown>('ngdpbase.auth.throttle.enabled', true) !== false);
  if (throttleWarning) logger.warn(`🔐 ${throttleWarning}`);

  // #1767: ngdpbase.session.max-age is the absolute cap from sign-in, enforced
  // per request below (checkSessionLimits). The cookie and the store are
  // rolling — express-session re-issues the cookie with now + maxAge whenever
  // the session changes, and the file store expires a session maxAge after its
  // LAST access — so they cannot be the cap; they only have to outlast it. A
  // sign-in sets its own cookie to the cap (AuthManager.completeSignIn); the
  // default below is for sessions nobody signed in to. The store's ttl is only
  // the fallback for a session with no cookie lifetime of its own.
  const sessionCap = sessionCapMs(configManager.getProperty('ngdpbase.session.max-age', DEFAULT_SESSION_MAX_AGE_MS));
  const anonymousSession = anonymousSessionMs(sessionCap, configManager.getProperty('ngdpbase.session.anonymous-max-age', DEFAULT_ANONYMOUS_SESSION_MS));
  const sessionStore = new FileStore({
    path: sessionPath,
    ttl: sessionCap / 1000,
    retries: 0,
    reapInterval: 3600
  });
  // #1246: the same store object the routes see as req.sessionStore, handed to
  // the manager so SessionsPlugin reads it in-process instead of requesting
  // this server's own URL.
  (engine.getManager('SessionStatsManager') as { attachStore(store: unknown): void } | null)?.attachStore(sessionStore);
  // #1937: once at startup, end every stored session whose account is gone,
  // turned off or another of the same name — leftovers from before the fix,
  // or from a close the store missed. Off the request path; never stops the boot.
  void (engine.getManager('UserManager') as { endStaleSessions(): Promise<number> } | null)?.endStaleSessions()
    .then((ended) => { if (ended > 0) logger.info(`[SESSION] Ended ${ended} session(s) that no longer belong to their account (#1937)`); })
    .catch((err: unknown) => logger.error('[SESSION] Could not sweep sessions of closed accounts at startup (#1937):', err));

  // #1626: a session that expires in the store, or is destroyed by a path that
  // could not reach endSessionKeys, leaves its unlocked keys with no owner.
  // Sweep them: any bag whose handle no live session holds is dropped.
  // #1721: a maintenance job on the scheduler, listed on Admin → Scheduled
  // Jobs; a sweep that fails is audited and notified, not only logged.
  const sessionStats = engine.getManager('SessionStatsManager') as { liveHandles(): Promise<Set<string>> } | null;
  if (sessionStats) {
    (engine.getManager('BackgroundJobManager') as BackgroundJobManager | null)?.registerMaintenance({
      id: 'sessions.key-sweep',
      displayName: 'Sessions: drop the unlocked keys of ended sessions',
      everyMs: ORPHANED_KEY_SWEEP_MS,
      run: async () => {
        const dropped = sweepOrphanedKeys(await sessionStats.liveHandles());
        if (dropped > 0) logger.info(`[SESSION] Dropped the unlocked keys of ${dropped} ended session(s) (#1626)`);
        return `${dropped} dropped`;
      }
    });
  }

  app.use(session({
    store: sessionStore,
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
      maxAge: anonymousSession
    }
  }));

  // #2071: a secure cookie on a request Express sees as plain http is never
  // sent, and nothing else says so: login fails as "invalid CSRF token". The
  // default (secure in production) stays; UserManager makes the failure loud,
  // once per process. Registered only when the cookie is secure, so other
  // sites pay nothing; on a secure one it is a boolean check per request.
  if (sessionSecure) {
    const sessionsOwner = engine.getManager('UserManager') as { reportSessionCookieWithheld(): void } | null;
    app.use((req, _res, next) => {
      if (sessionCookieWithheld(req)) sessionsOwner?.reportSessionCookieWithheld();
      next();
    });
  }

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
        authenticate?: (id: string, creds: { token?: string }) => Promise<import('./managers/AuthManager.js').AuthenticateResult>;
        signInRecord?: (result: import('./managers/AuthManager.js').AuthenticateResult) => import('./managers/AuthManager.js').SignInRecord | null;
        getProviders?: () => Array<{ id: string }>;
        stampSessionGeneration?: (req: Request, username: string) => Promise<void>;
      } | null;
      const hasCf = authManager?.getProviders?.().some(p => p.id === 'cloudflare-access');
      if (!authManager?.authenticate || !hasCf) { next(); return; }
      const result = await authManager.authenticate('cloudflare-access', { token });
      if (result.success && result.username && req.session) {
        req.session.username = result.username;
        // #1523: how this session signed in, as every other sign-in path records it.
        const record = authManager.signInRecord?.(result);
        if (record) req.session.signIn = record;
        // #1482, #1937: stamped at sign-in, like every other sign-in path.
        await authManager.stampSessionGeneration?.(req, result.username);
      }
    } catch (err) {
      logger.warn('[CloudflareAccess middleware] failed:', err);
    }
    next();
  });

  // Middleware to attach user context from session
  const debugSession = configManager.getProperty('ngdpbase.logging.debug.session', false);
  const debugRequests = configManager.getProperty('ngdpbase.logging.debug.requests', false);

  const authManagerForRoles = engine.getManager('AuthManager') as {
    rolesAtSignIn?(roles: readonly string[], signInAal: number, cap?: number): { kept: string[]; steppedDown: string[] };
    aalCapFor?(username: string): Promise<1 | 2 | 3 | 0>;
    aalReachFor?(username: string): Promise<{ now: 1 | 2 | 3 | 0; ifEnrolled: 1 | 2 | 3 | 0 }>;
    rolesAwaitingEnrolment?(roles: readonly string[], reach: { now: number; ifEnrolled: number }): string[];
    hasCredential?(username: string, kind: 'passkey'): boolean;
    passkeyRelyingParty?(): unknown;
    subjectActingFor?(req: Request, self: NonNullable<Request['userContext']>): Promise<NonNullable<Request['userContext']>>;
    actingForChoices?(req: Request): { grants: unknown[] } | null;
  } | null;
  const roleManager = engine.getManager('RoleManager') as {
    roleIdleTimeouts?(): Record<string, number>;
    resolveUserRoles(ctx: ReturnType<typeof systemContext>, username: string): Promise<string[]>;
  } | null;
  const userManager = engine.getManager('UserManager') as {
    getUser(username: string): Promise<{ isActive?: boolean; roles?: string[]; username?: string; sessionGeneration?: number; [key: string]: unknown } | null>;
    isAdminUsingDefaultPassword(): Promise<boolean>;
  };
  // #1431 step 13: the request's subject is built by the PIP — the account and
  // the roles it holds now — in one place, not inline here.
  const pip = engine.getManager('PolicyInformationPoint') as {
    anonymousSubject(): NonNullable<Request['userContext']>;
    subjectFor(username: string): Promise<NonNullable<Request['userContext']> | null>;
  };

  app.use((req: Request, res: Response, next: NextFunction): void => {
    if (debugRequests) {
      console.log(`📨 ${req.method} ${req.url}`);
    }

    if (debugSession) {
      console.log('[SESSION-DEBUG] Session ID:', req.sessionID);
      console.log('[SESSION-DEBUG] Session data:', JSON.stringify(req.session));
      console.log('[SESSION-DEBUG] Session username:', req.session?.username);
    }

    void (async (): Promise<void> => {
      // Ends the signed-in session in place, through the one session-end door
      // (#1670): its private-store keys are dropped and the end is audited.
      const signOut = (reason: SessionEndReason, why: string): void => {
        endSession(engine, req.session, reason, { ipAddress: req.ip, userAgent: req.get('user-agent') });
        logger.info(`[SESSION] Signed out ${req.session.username}: ${why}`);
        delete req.session.username;
        delete req.session.privateStoreHandle;
        delete req.session.sessionGeneration;
        delete req.session.accountCreatedAt;
        delete req.session.lastActivity;
        delete req.session.signedInAt;
        delete req.session.signIn;
        req.session.isAuthenticated = false;
        // #1767: back to an anonymous session's lifetime; the sign-in had set the cap.
        if (req.session.cookie) req.session.cookie.maxAge = anonymousSession;
      };

      // #1937: a session whose account is gone, turned off, or is another
      // account of the same name is over; #1482: so is one signed in before
      // the account's password last changed. One rule, checkSessionAccount.
      if (req.session?.username && req.session.isAuthenticated) {
        const verdict = checkSessionAccount(req.session, await userManager.getUser(req.session.username));
        if (verdict.end) signOut(verdict.end, ACCOUNT_END_WHY[verdict.end]);
        else if (verdict.bind !== undefined) req.session.accountCreatedAt = verdict.bind;
      }

      // #1767: a session past ngdpbase.session.max-age from its sign-in is over,
      // however active it has been; #1546: so is one idle past
      // ngdpbase.session.idle-timeout-minutes. Both ends are audited with their
      // reason. Read per request, so a change takes effect without a restart.
      if (req.session?.username && req.session.isAuthenticated) {
        // A role may shorten the site value (#1546). Roles are looked up only
        // when some role sets one, so the default costs nothing per request.
        const roleTimeouts = roleManager?.roleIdleTimeouts?.() ?? {};
        const roleMinutes = Object.keys(roleTimeouts).length === 0
          ? []
          : (await roleManager?.resolveUserRoles(systemContext(engine, 'read the signed-in account\'s roles for its idle timeout (#1546)'), req.session.username) ?? []).map(r => roleTimeouts[r]);
        const timeoutMs = effectiveIdleTimeoutMs(configManager.getProperty('ngdpbase.session.idle-timeout-minutes', 0), roleMinutes);
        res.locals.idleTimeoutMs = timeoutMs;
        const now = Date.now();
        const capMs = sessionCapMs(configManager.getProperty('ngdpbase.session.max-age', DEFAULT_SESSION_MAX_AGE_MS));
        const verdict = checkSessionLimits(req.session, now, { idleMs: timeoutMs, capMs });
        if (verdict.end) {
          signOut(verdict.end, verdict.end === 'max-age'
            ? 'signed in longer than ngdpbase.session.max-age (#1767)'
            : 'idle past ngdpbase.session.idle-timeout-minutes (#1546)');
        } else {
          if (verdict.stampSignedIn) req.session.signedInAt = now;
          if (req.path !== IDLE_STATUS_PATH && verdict.touch) req.session.lastActivity = now;
        }
      }

      if (req.session?.username && req.session.isAuthenticated) {
        const sessionContext = await pip.subjectFor(req.session.username);
        if (sessionContext) {
          // #1179: the address travels on the subject, so a manager records it from the context it is handed.
          // #1382: so does the handle to this session's private-store keys — never the session id.
          const privateStoreHandle = req.session.privateStoreHandle;
          // #448: a role whose required-aal is above this session's sign-in
          // steps down — the person acts without it until they sign in strongly
          // enough. One rule, here where the request's roles are set. A session
          // from before sign-ins were recorded counts as AAL1.
          // #1690: never above what this account's allowed sign-in methods can
          // reach — an account with no way to AAL2 holds its roles at AAL1.
          const reach = await authManagerForRoles?.aalReachFor?.(sessionContext.username);
          const aalCap = reach?.now;
          // #1690: a role held below its level only because no factor is
          // enrolled — the person keeps it, and every page says to add one.
          const awaiting = reach ? authManagerForRoles?.rolesAwaitingEnrolment?.(sessionContext.roles ?? [], reach) ?? [] : [];
          if (awaiting.length > 0) res.locals.aalEnrolNag = { roles: awaiting };
          const stepDown = authManagerForRoles?.rolesAtSignIn?.(sessionContext.roles ?? [], req.session.signIn?.aal ?? 1, aalCap);
          if (stepDown && stepDown.steppedDown.length > 0) {
            res.locals.aalStepDown = {
              roles: stepDown.steppedDown,
              hasPasskey: authManagerForRoles?.hasCredential?.(sessionContext.username, 'passkey') ?? false,
              passkeysAvailable: Boolean(authManagerForRoles?.passkeyRelyingParty?.())
            };
          }
          const self = {
            ...sessionContext,
            ...(stepDown ? { roles: stepDown.kept } : {}),
            ...(aalCap !== undefined ? { aalCap } : {}),
            ipAddress: req.ip,
            ...(typeof privateStoreHandle === 'string' && privateStoreHandle ? { privateStoreHandle } : {}),
            // #1635: how and when this session signed in, so the PDP decides step-up at the door.
            ...(req.session.signIn ? { signIn: req.session.signIn } : {})
          };
          // #1762 slice 4: a session acting for someone carries the represented
          // person's subject, rebuilt from the live grant on every request; a
          // dead grant drops it back to `self`. AuthManager builds it, here only.
          req.userContext = await authManagerForRoles?.subjectActingFor?.(req, self) ?? self;
          if (req.userContext.viaProxy) res.locals.actingFor = { name: req.userContext.username };
          // #1762 slice 7: the header's person picker, only for someone a live grant lets act for another.
          const actingForChoices = authManagerForRoles?.actingForChoices?.(req);
          // `returnTo`: switching comes back to the page it was made on (switchActingFor keeps it on this site).
          if (actingForChoices && actingForChoices.grants.length > 0) res.locals.actingForPicker = { ...actingForChoices, returnTo: req.method === 'GET' ? req.originalUrl : '/' };
          logger.info(`[SESSION] Restored session for user: ${sessionContext.username}${req.userContext.viaProxy ? ` acting for ${req.userContext.username}` : ''}`);
        } else {
          req.userContext = { ...pip.anonymousSubject(), ipAddress: req.ip };
          logger.info('[SESSION] User not found or inactive, treating as Anonymous');
        }
      } else {
        req.userContext = { ...pip.anonymousSubject(), ipAddress: req.ip };
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
  // provider would never be consulted. It tries each registered provider that
  // declares `acceptsBearer`, in registration order, and takes the first
  // success (#1576: selected by the flag, not a hardcoded list, so the OIDC
  // provider's tokens join without editing this).
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.headers['authorization'];
      const bearer = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
      // #1759: Dawarich (an Immich client) presents its agent token in x-api-key,
      // accepted on its two routes only; everywhere else a token is a Bearer.
      const apiKey = req.headers['x-api-key'];
      const keyToken = !bearer && typeof apiKey === 'string' && isDawarichApiKeyPath(req.method, req.path) ? apiKey.trim() : '';
      if (!bearer && !keyToken) { next(); return; }
      const authManager = engine.getManager('AuthManager') as {
        authenticate?: (id: string, creds: { token?: string }) => Promise<{
          success: boolean;
          username?: string;
          viaToken?: { id: string; name: string; scopes: string[] };
          aal?: number;
        }>;
        getProviders?: () => Array<{ id: string; acceptsBearer?: boolean }>;
        rolesAtSignIn?: (roles: readonly string[], signInAal: number, cap?: number) => { kept: string[]; steppedDown: string[] };
        aalCapFor?: (username: string) => Promise<1 | 2 | 3 | 0>;
      } | null;
      const candidates = bearerProviderIds(authManager?.getProviders?.() ?? []);
      const token = bearer || keyToken;

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

      let result: { success: boolean; username?: string; viaToken?: { id: string; name: string; scopes: string[] }; aal?: number } = { success: false };
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
        const subject = await pip.subjectFor(result.username);
        if (subject) {
          // #1576: a credential that carries its sign-in level holds only the
          // roles that level reaches, as a web session does (#1569).
          const aalCap = await authManager.aalCapFor?.(result.username);
          const roles = result.aal !== undefined && authManager.rolesAtSignIn
            ? authManager.rolesAtSignIn(subject.roles, result.aal, aalCap).kept
            : subject.roles;
          req.userContext = {
            ...subject,
            roles,
            ...(aalCap !== undefined ? { aalCap } : {}),
            ipAddress: req.ip,
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
  // PolicyInformationPoint, which is what makes one switch mean one state.
  //
  // Resolved per request rather than captured here, so the toggle takes effect
  // immediately and closing or reopening an instance needs no restart.
  //
  // #1906: whether the site is in maintenance mode is engine.maintenance's —
  // the admin switch is one reason in it — and its visitor view is what this
  // page shows.
  app.use(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const maintenanceCm = engine.getManager<import('./managers/ConfigurationManager.js').default>('ConfigurationManager');
    // #1432: one gate, several reasons — maintenance, a schedule such as
    // business hours, a holiday. Each has its own message, and the page says
    // which one closed the instance.
    const availability = resolveAvailability(
      (key) => maintenanceCm?.getProperty?.(key, undefined),
      new Date(),
      engine.maintenance.visitorView(maintenanceCm)
    );
    if (!availability.blocked) { next(); return; }

    if (req.path.startsWith('/css') || req.path.startsWith('/js') ||
        req.path.startsWith('/images') || req.path === '/favicon.ico' ||
        req.path === '/favicon.svg' || req.path.startsWith('/admin') ||
        req.path.startsWith('/login') || req.path.startsWith('/logout')) {
      next(); return;
    }

    // #1198: the bypass is a permission, not a role name. A role check skips
    // policy and the token ceiling — an admin's read-only token would have
    // walked through maintenance on its owner's role.
    const isAdmin = availability.allowAdmins && await subjectMayDo(engine, req.userContext, 'admin-system');
    if (isAdmin) {
      next(); return;
    }

    res.status(503).render('maintenance', {
      message: availability.message,
      // #1432: which reason closed it, so the page can say so and a test can
      // tell a schedule from a holiday.
      reason: availability.kind,
      estimatedDuration: availability.estimatedDuration,
      siteName: maintenanceCm?.getApplicationName?.() ?? startingSiteName,
      notifications: [],
      allowAdmins: availability.allowAdmins,
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

  // 6b'. The consent gate (#1603): a session asked at sign-in to accept the
  //      terms goes nowhere else until it does, and an add-on's registered
  //      paths ask for its documents first. Before the add-ons, so their routes
  //      are behind it.
  const { consentGate } = await import('./middleware/consentGate.js');
  app.use(consentGate(engine));

  // 6c. Initialize addons NOW — after session + userContext + CSRF middleware
  //     — so addon route handlers can read req.session and req.userContext
  //     normally and inherit CSRF protection on their own POST routes.
  // #1883: a site-critical add-on that did not load blocks the instance the
  // same way (#1152), and is only known now that the add-ons have loaded.
  const reasonsBeforeAddons = new Set(engine.maintenance.reasons());
  await engine.initializeAddons();
  const addonBlocks = engine.maintenance.reasons().filter((r) => !reasonsBeforeAddons.has(r));
  // #1603: every document people are asked to accept, core's and the add-ons' just
  // registered, read once, so a missing one shows on the dashboard from start-up.
  await (engine.getManager('ConsentManager') as { checkDocuments?(): Promise<void> } | null)?.checkDocuments?.();
  if (addonBlocks.length > 0) {
    logger.error(`🚨 ${describeBlocked(addonBlocks)}`);
    logger.error('[startup] The instance is NOT serving content. Sign in at /admin for the notification that says how to fix it, then restart.');
  }

  // #1523: every role's required-aal must be reachable by the sign-in factors
  // actually available — checked here, once add-ons have registered theirs. A
  // role nobody can sign in to is a lockout, so the server refuses to start,
  // as it does without a session secret (#1194).
  // #448: only a level the operator set refuses; a shipped default no factor
  // reaches degrades instead, so an upgrade never locks an instance out.
  const unreachable = (engine.getManager('AuthManager') as { checkRequiredAal?(): string[] } | null)
    ?.checkRequiredAal?.() ?? [];
  if (unreachable.length > 0) {
    console.error('🔥🔥🔥 FATAL: Refusing to start — a role requires a sign-in level no available factor can reach (#1523):');
    for (const problem of unreachable) console.error(`  - ${problem}`);
    console.error('Lower the role\'s required-aal, or enable a sign-in method that reaches it (a passkey, or the email link as a second factor), then restart.');
    process.exit(1);
  }

  // #1715: scheduled jobs start looking for due slots only now, with every
  // manager and add-on up, so a catch-up run never meets one still starting.
  (engine.getManager('BackgroundJobManager') as { startScheduler?(): void } | null)?.startScheduler?.();

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
    // #1198: policy, not a role name.
    const isAdmin = await subjectMayDo(engine, req.userContext, 'admin-system');
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
        const metricsPage = await pageManager.getPageBySlug('metrics', req.userContext ?? ANONYMOUS_SUBJECT);
        if (metricsPage?.title) {
          res.redirect(`/view/${encodeURIComponent(metricsPage.title)}`);
          return;
        }
      }
    } catch { /* fall through to 403 */ }
    res.status(403).send('Admin access required');
  });

  const wikiRoutes = new WikiRoutes(engine);
  // #1749: add-on views get core's template data through the engine — one path.
  engine.templateData = async (req) => ({ ...(await wikiRoutes.getCommonTemplateData(req)) });
  // #1572: the OpenID Connect sign-in bridge, ahead of the wiki routes so no
  // page route claims /oidc/interaction/*. Only when the provider is serving.
  if (oidcHandler && oidcManager) {
    registerOidcRoutes(app, {
      oidc: oidcManager,
      templateData: (req) => wikiRoutes.getCommonTemplateData(req),
      permit: (req, res, permission, mode) => wikiRoutes.permitRequest(req, res, permission, mode),
      // #1764: consent lines in the catalog's plain words, the same lookup as "My tokens and devices".
      describeScopes: (names) => engine.getManager<import('./managers/AuthManager.js').default>('AuthManager')?.describeScopes(names) ?? []
    });
  }
  wikiRoutes.registerRoutes(app);

  // 8. Mark engine as ready
  // #1906: ready means booted. A site held in maintenance mode by a failure
  // still serves only the maintenance page and the repair screens: the gate
  // asks engine.maintenance per request, so a reason that leaves reopens it.
  engineReady = true;

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

  // The password itself is never echoed. The shipped default is the well-known
  // 'admin123', but an operator may have set their own, and echoing that would
  // write a live credential into the logs — /admin/logs is readable by anyone
  // holding `admin-read`, which is exactly what the read-only demo role grants
  // (#1029).
  const isDefaultPassword = await userManager.isAdminUsingDefaultPassword();
  if (isDefaultPassword) {
    console.log('⚠️  The admin account is still using the bootstrap password from');
    console.log("⚠️  'ngdpbase.user.security.defaultpassword' (NGDPBASE_ADMIN_PASSWORD).");
    console.log('⚠️  Change it, or rotate that value.');
  }

  console.log('='.repeat(60) + '\n');
  logger.info(`Wiki engine ready, accepting requests at ${baseURL}`);

})();
