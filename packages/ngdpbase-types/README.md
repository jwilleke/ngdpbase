# @jwilleke/ngdpbase-types

The TypeScript types an ngdpbase add-on compiles against, and a test kit of core's own values. Published with each ngdpbase release, at the same version. A dev dependency only: it never ships to a site, where `host` and `engine` hand the add-on the running core.

```sh
npm install --save-dev @jwilleke/ngdpbase-types@<your ngdpbase.minVersion>
```

```typescript
import type { AddonModule, AddonHost, WikiEngine } from '@jwilleke/ngdpbase-types';
import { buildAddonHost, openAddonTestDatabase, toCsv, formatters } from '@jwilleke/ngdpbase-types/testing';
```

- The main entry is types only. Importing it at run time fails, on purpose.
- `/testing` is for tests. `buildAddonHost(slug, defaults, engine?)` is the real host; `engine` names the system principal `host.systemContext(reason)` uses (core's fallback without one). `openAddonTestDatabase(owner, { migrations, ledgerTable })` is the handle `openAddonDatabase` returns, in memory. `toCsv` is `ExportManager.toCsv`. `formatters` is a plugin's `context.formatters`.

The add-on guide is [docs/guides/addons-developer-guide.md](https://github.com/jwilleke/ngdpbase/blob/master/docs/guides/addons-developer-guide.md).
