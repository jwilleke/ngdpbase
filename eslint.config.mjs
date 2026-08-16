import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
// ────────────────────────────────────────────────────────────────
// Add this import
// import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default tseslint.config(
  {
    // Ignore config and common root files from type-aware linting
    ignores: ["eslint.config.mjs", "node_modules/", "dist/", "addons/*/public/"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
      parserOptions: {
        project: [
          "./tsconfig.json",
          "./tsconfig.test.json",
          "./addons/calendar/tsconfig.json",
          "./addons/elasticsearch/tsconfig.json",
          "./addons/journal/tsconfig.json",
          "./addons/journal/tsconfig.test.json",
          "./addons/feeds/tsconfig.json",
          "./addons/demo/tsconfig.json"
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        {
          "allowExpressions": true,
          "allowTypedFunctionExpressions": true
        }
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "quotes": ["error", "single", { "avoidEscape": true }],
      "semi": ["error", "always"],
      "indent": ["error", 2],
      "comma-dangle": ["error", "never"],
      "object-curly-spacing": ["error", "always"],
      "arrow-spacing": "error",
      "keyword-spacing": "error",
      "space-before-function-paren": [
        "error",
        {
          "anonymous": "always",
          "named": "never",
          "asyncArrow": "always"
        }
      ],
      // #625 — block reintroduction of the role/permission boilerplate this
      // issue's sweep removed. Migrations:
      //   - .isAdmin is broken (was never set by session middleware).
      //     Use wikiContext.hasRole('admin') or WikiContext.userHasRole(userContext, 'admin').
      //   - .roles.includes('admin') style checks should go through a context
      //     method so the call shape is uniform across routes/middleware/plugins.
      //     Use wikiContext.hasRole(...names) for handlers that have a WikiContext,
      //     parseContext.hasRole(...names) for parser-pipeline plugins,
      //     or WikiContext.userHasRole(userContext, ...names) for hot-path callers
      //     (per-request middleware) that don't need a full WikiContext.
      "no-restricted-syntax": [
        "error",
        {
          "selector": "MemberExpression[property.name='isAdmin']",
          "message": "Reading `.isAdmin` is broken — the field was never set by session middleware. Use `wikiContext.hasRole('admin')`, `parseContext.hasRole('admin')`, or `WikiContext.userHasRole(userContext, 'admin')` (#625)."
        },
        {
          "selector": "CallExpression[callee.type='MemberExpression'][callee.property.name='includes'][callee.object.type='MemberExpression'][callee.object.property.name='roles']",
          "message": "Inline `.roles.includes(...)` permission check — replace with `wikiContext.hasRole(...names)` / `parseContext.hasRole(...names)` / `WikiContext.userHasRole(userContext, ...names)` (#625)."
        },
        {
          "selector": "CallExpression[callee.type='MemberExpression'][callee.property.name='includes'][callee.object.type='ChainExpression'][callee.object.expression.property.name='roles']",
          "message": "Inline `.roles?.includes(...)` permission check — replace with `wikiContext.hasRole(...names)` / `parseContext.hasRole(...names)` / `WikiContext.userHasRole(userContext, ...names)` (#625)."
        }
      ]
    }
  },

  // ────────────────────────────────────────────────────────────────
  // Test file overrides — relax type-safety rules that fire on mock objects
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-console": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      // #625 — test fixtures legitimately read `.isAdmin` and `.roles.includes(...)`
      // when simulating the auth check (e.g. `mockRoles.includes('admin')`).
      // Production code must still go through the canonical context methods.
      "no-restricted-syntax": "off"
    }
  },

  // ────────────────────────────────────────────────────────────────
  // Scripts and e2e tests — utility code, relax type-safety and style rules
  {
    files: ["src/utils/standardize-categories.ts", "src/utils/version.ts"],
    rules: { "no-console": "off" }
  },

  {
    files: ["scripts/**/*.ts", "tests/e2e/**/*.ts", "playwright.config.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-console": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off"
    }
  },

  // ────────────────────────────────────────────────────────────────
  // #1057 — the store boundary.
  //
  // "All code that touches a resource goes through that resource's manager.
  // There is no second path." (docs/guiding-framework.md). Access logging,
  // authorization, backup and encryption are each truthful ONLY because of
  // that invariant — a path reaching around a manager does not make the audit
  // log incomplete, it makes it wrong, and silently.
  //
  // The invariant held by convention until now. It erodes one convenient
  // direct import at a time and nothing goes red, which is exactly the shape
  // that documentation cannot catch.
  //
  // Applied to src/ only: scripts/ and tests legitimately reach past managers,
  // and addons/ have their own boundaries. The exemptions below are narrow and
  // stated, so a future reader can tell a decision from an oversight.
  {
    files: ["src/**/*.ts"],
    ignores: [
      "src/managers/**",   // managers ARE the door; this is their job
      "src/providers/**",  // providers import each other (base classes, shared types)
      "**/__tests__/**",   // tests construct providers directly on purpose
      "**/*.test.ts",
      // The logger bootstraps at module load, before WikiEngine and
      // ConfigurationManager exist, so it cannot reach a manager to obtain its
      // provider. Documented in the file's own header and in
      // BaseLoggingProvider. This is a genuine bootstrap-ordering exemption,
      // not a convenience.
      "src/utils/logger.ts"
    ],
    rules: {
      // `allowTypeImports` is the mechanism for the type-only carve-out, NOT a
      // path negation. Every import in this ESM codebase ends in `.js`, so a
      // pattern excluding `*.js` excludes everything and the rule silently
      // matches nothing — which is precisely how the first version of this
      // rule passed while enforcing nothing.
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [{
          group: ["**/providers/*"],
          allowTypeImports: true,
          message:
            "Only src/managers/ may import from src/providers/ (#1057). Go through the resource's manager. " +
            "A type-only import is allowed — write `import type { X } from ...`, which erases at compile time " +
            "and creates no runtime path to the data."
        }]
      }]
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Add this as the **very last** item
  //eslintPluginPrettierRecommended
);