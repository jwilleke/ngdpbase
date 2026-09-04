
/**
 * Admin routes for the elasticsearch add-on.
 * Mounted at /addons/elasticsearch in register().
 *
 * Endpoints:
 *   GET  /addons/elasticsearch  — connection status and config summary
 */

import { Router, type Request, type Response } from 'express';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type { Sist2AssetProvider } from '../src/Sist2AssetProvider.js';

export interface ElasticsearchAdminConfig {
  esUrl: string;
  esIndex: string;
  sist2Url: string | null;
  indexIds: number[];
  hiddenPaths: string[] | null;
}

export default function adminRoutes(
  engine: WikiEngine,
  getProvider: () => Sist2AssetProvider | null,
  config: ElasticsearchAdminConfig
): Router {
  const router = Router();

  // ── GET /addons/elasticsearch ─────────────────────────────────────────────
  router.get('/', async (req: Request, res: Response) => {
    void (async () => {
      try {
        const ctx = ApiContext.from(req, engine);
        ctx.requireAuthenticated();
        await ctx.requirePermission('admin-system'); // #1198: policy, not a role name

        const p = getProvider();
        // #1186: the detailed check names WHICH state sist2 is in — not
        // configured, refused by the egress policy, or unreachable — where
        // the old line blamed "es-url / sist2-url config" for all of them.
        const detail = p ? await p.healthCheckDetailed() : { healthy: false, message: 'Provider not initialised' };
        const healthy = detail.healthy;
        const message = detail.message;

        res.render('admin-elasticsearch', {
          currentUser: req.userContext,
          healthy,
          message,
          config
        });
      } catch (err) {
        if (err instanceof ApiError) { res.status(err.status).send(err.message); return; }
        res.status(500).send(String(err));
      }
    })();
  });

  return router;
}
