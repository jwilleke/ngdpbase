
/**
 * What every forms admin view needs from the host, set once per request.
 *
 * Add-on routes do not get core's template data, so the header had no CSRF
 * token (its meta tag was empty, csrfFetch sent nothing, and every admin POST
 * got the CSRF middleware's 403) and no left menu (the sidebar rendered empty).
 * See docs/guides/addons-developer-guide.md, "leftMenu in add-on views".
 */

import type { Request, Response, NextFunction } from 'express';
import type { WikiEngine } from '../../../dist/src/types/WikiEngine.js';
import type PageManager from '../../../dist/src/managers/PageManager.js';
import type RenderingManager from '../../../dist/src/managers/RenderingManager.js';
import { formatLeftMenuContent } from '../../../dist/src/utils/leftMenuNav.js';

async function getLeftMenu(engine: WikiEngine, userContext: unknown): Promise<string | null> {
  try {
    const pm = engine.getManager<PageManager>('PageManager');
    const rm = engine.getManager<RenderingManager>('RenderingManager');
    if (!pm || !rm) return null;
    const page = await pm.readChromePage('left-menu');
    if (!page) return null;
    const rendered = await rm.renderMarkdown(page.content ?? '', 'LeftMenu', userContext as never, null);
    return formatLeftMenuContent(rendered);
  } catch {
    return null;
  }
}

export default function viewLocals(engine: WikiEngine) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const session = (req as Request & { session?: { csrfToken?: string } }).session;
      res.locals.csrfToken = session?.csrfToken ?? '';
      res.locals.leftMenu = await getLeftMenu(engine, (req as Request & { userContext?: unknown }).userContext);
      next();
    })();
  };
}
