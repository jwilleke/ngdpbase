# Moving Off a Site Image

> This page is a migration note. The packaged model it used to describe (an add-on installed with npm into an image you build) is retired. There is one add-on model: [`addon-architecture.md`](../addon-architecture.md#distribution-models).

A site built `FROM ghcr.io/jwilleke/ngdpbase`, with an add-on baked in (an npm install copied into the image, or an `addons/` folder copied in), should move to the installed model:

- 1 Publish the add-on to npm with provenance. The generated `publish.yml` does this ([Installed add-ons](../../guides/addons-developer-guide.md#installed-add-ons)).
- 2 Run the stock image `ghcr.io/jwilleke/ngdpbase:<version>` and drop the Dockerfile, the build step and the `node_modules:` entry in `ngdpbase.managers.addons-manager.addons-path`. A leftover `node_modules:` entry is now ignored, with one warning at start (`addons-path entry 'node_modules:…' is no longer supported and is ignored; install add-ons with ngdpbase.addons.install`); it never stops the start ([#2102](https://github.com/jwilleke/ngdpbase/issues/2102)).
- 3 Add `ngdpbase.addons.install` and the add-on's enable key to the site's `app-custom-config.json`, then restart. The keys, the checks core makes, updating from Admin → Add-ons and rollback are in [`domain-site.md`](./domain-site.md).

Keep any data the add-on writes on the persistent volume, under its own data path; it is unaffected by the move. An add-on of the same slug that is still reachable through `addons-path` wins over the installed copy, so remove the old path entry as part of the move.
