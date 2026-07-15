# ngdpbase Add-ons

This directory contains optional add-on modules that extend ngdpbase functionality.

## Creating an Add-on

Each add-on lives in its own subdirectory with an `index.js` or `index.ts` entry point.

### Directory Structure

```
addons/
├── your-addon/
│   ├── index.js          # Required: Entry point
│   ├── package.json      # Optional: Add-on dependencies
│   ├── routes.js         # Optional: Express routes
│   ├── models/           # Optional: Data models
│   └── README.md         # Recommended: Documentation
└── shared/               # Reserved: Shared utilities
```

### Add-on Interface

Your `index.js` must export an object implementing the `AddonModule` interface:

```javascript
module.exports = {
  // Required fields
  name: 'your-addon',           // Unique identifier
  version: '1.0.0',             // Semantic version

  // Optional fields
  description: 'What this add-on does',
  author: 'Your Name',
  dependencies: ['other-addon'], // Other add-ons this depends on

  // Required: Called during startup if add-on is enabled
  async register(engine, config) {
    // Access managers
    const pageManager = engine.getManager('PageManager');

    // Register routes (if you have an Express app reference)
    // const app = engine.app;
    // app.use('/api/your-addon', require('./routes'));

    // Initialize your add-on
    console.log('Your add-on initialized!');
  },

  // Optional: Health check
  async status() {
    return {
      healthy: true,
      message: 'All systems operational'
    };
  },

  // Optional: Cleanup on shutdown
  async shutdown() {
    // Close connections, cleanup resources
  }
};
```

## Configuration

Add-ons are configured in `config/app-custom-config.json`:

```json
{
  "ngdpbase.addons.your-addon.enabled": true,
  "ngdpbase.addons.your-addon.customSetting": "value"
}
```

By default, all add-ons are **disabled**. You must explicitly enable each add-on.

## Accessing Configuration

In your `register()` function, the `config` parameter contains all settings under `ngdpbase.addons.your-addon.*`:

```javascript
async register(engine, config) {
  const customSetting = config.customSetting || 'default';
  // ...
}
```

## Dependencies Between Add-ons

If your add-on depends on another, declare it in the `dependencies` array:

```javascript
module.exports = {
  name: 'financial-ledger',
  dependencies: ['person-contacts'], // Will load after person-contacts
  // ...
};
```

The AddonsManager will:

1. Verify all dependencies are installed
2. Verify all dependencies are enabled
3. Load add-ons in correct dependency order

## Security Notes

- Add-ons run in the same Node.js process as ngdpbase
- Only install add-ons from trusted sources
- Review add-on code before installation
- Add-on databases should be stored in `./data/addons/` or within the add-on directory

## Example Add-ons

See the [fairways-gen2-website](https://github.com/jwilleke/fairways-gen2-website) repository for example add-ons:

- `person-contacts` - Contact/CRM management
- `financial-ledger` - Double-entry accounting
- `business-hub` - Dashboard integration

## Related Documentation

- [Issue #158](https://github.com/jwilleke/ngdpbase/issues/158) - AddonsManager specification
- [Business Add-on MVP](../docs/planning/Business-packages/business-addon-mvp.md) - Planning docs
