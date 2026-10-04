# ngdpbase Add-ons

Optional modules that extend a running instance. How to write one — prerequisites, the slug, bundled versus drop-in versus packaged, seed pages, permissions, and the lint that has to pass — is [the addons developer guide](../docs/guides/addons-developer-guide.md). This file is the list of what ships in this directory.

Each addon below is off until `ngdpbase.addons.<slug>.enabled` is true. Descriptions are the `description` each module exports.

| Add-on | Description |
| --- | --- |
| `calendar` | Event calendar with FullCalendar UI and RFC 5545 support. Depends on `forms` |
| `demo` | Public demo instance content and the read-only demo-admin role |
| `elasticsearch` | Elasticsearch external asset provider (sist2/S3/NAS) |
| `feeds` | Data-ingestion framework — external feeds as CatalogSources |
| `forms` | Generic schema-driven forms — define JSON forms, render on pages, store submissions, trigger hooks |
| `journal` | Personal journal — entries are pages with timeline rendering |

`journal` and `calendar` are the worked examples. Their permissions live in each `config/default-config.json`. All six are TypeScript (`index.ts`) and are compiled by `npm run build:addons`. `AddonsManager` loads `index.js` when that file is present, otherwise `index.ts`.

Further examples live in [fairways-gen2-website](https://github.com/jwilleke/fairways-gen2-website): `person-contacts`, `financial-ledger`, `business-hub`.
