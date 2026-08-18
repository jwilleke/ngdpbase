# Code Standards

This document outlines the coding standards and best practices for the ngdpbase project.

## GLOBAL CODE PREFERENCES

In all interactions and commit messages

- READ AGENTS.MD file and update as required.
- "One File Done Right" make all appropriate chages to each file.
- Be concise and sacrifice grammar for consistion
- DRY (Don't Repeat Yourself) principle in Code and Documentation
  - in Documentation Refer and link to other Documents.
- We ONLY do Test-Driven Development (TDD)
- Iterate Progressively. Start with Core features only: Gather feedback.
- Please think first and provide options - Presenting a list of unresolved questions to answer, if any. Questions, Comments and Suggestions are always encouraged!
- Your primary method for interacting with GitHub should be the CLI.
- On larger objectives present phased implementation plan
- NEVER put unencrypted "Secrets" in in Git or other CMS systems.
- Always create docs/project_log.md file as a log of work done on the project in format specified in document within "## Format"
- In Markdown documents:
  - No `**bold**` at the start of list items or as a pseudo-heading (Markdownlint rule MD036).
  - Do not number headings with `1. Heading`; `## Step 1 ...` is fine.
  - Bolded list-item prefixes are invalid — e.g., `- **Project Overview:**` should be `- Project Overview:`.
  - Whole-line bold acting as a heading is invalid — e.g., `**Process:**` should be a proper heading like `### Process`.

## Language & Environment

- Language: English (US) for all code and documentation
- Runtime: Node.js 18+ with TypeScript
- Target: ES2022
- Rationale: Node 18+ fully supports ES2022 features
- No eslint-disable
- Always Fix ESLint Errors
- Enable strict mode
- Fix ALL errors in each file before moving on
- Proper types, not `any`

## TypeScript Configuration

We use strict TypeScript settings (`strict: true`) to catch potential bugs at compile time. Key settings:

- Strict null checks enabled
- No implicit `any` types
- No unused variables or parameters
- All functions must have explicit return types (unless inferable)
- No implicit returns
- Underscore variable policy:
  - If a variable is truly unused, __DELETE IT__ (don't just prefix with `_`)
  - For required-but-unused callback/interface params, underscore prefix is acceptable (TypeScript `noUnusedParameters` requirement)
  - Use skip pattern `[, value]` instead of `[_key, value]` in destructuring
  - Use `.values()` instead of `.entries()` when only values are needed
- For tests specifically: (docs/testing/Complete-Testing-Guide.md)
  - New tests - write in TypeScript
  - Any changes are substantial (like a rewrite), convert to TypeScript

See `tsconfig.json` for full configuration.

For detailed TypeScript patterns, type definitions, and TSDoc conventions, see __[TypeScript Style Guide](./docs/TypeScript-Style-Guide.md)__.

## Code Formatting

### Prettier

Automatic code formatting using Prettier ensures consistency across the codebase.

Key settings:

- Single quotes for strings
- 2-space indentation
- 100-character line width
- Trailing commas disabled
- Unix line endings (LF)

Run formatting:

```bash
npm run format
```

### EditorConfig

EditorConfig settings (`.editorconfig`) ensure consistent editor behavior across different tools and IDEs.

## Linting

### ESLint

We use ESLint with TypeScript support to catch code quality issues.

Key rules:

- Prefer `const` over `let` and `var`
- Delete unused variables; prefix with `_` only if required by function signature
- `console` calls trigger warnings (use proper logging instead)
- Single quotes required (unless string contains quotes)
- Semicolons required
- Explicit function return types (with exceptions)
- No floating promises - always `await` async operations
- Proper async/await usage

Run linting:

```bash
npm run lint          # Runs both code and markdown linting
npm run lint:code     # ESLint only
```

Auto-fix fixable issues:

```bash
npm run lint:fix      # Fixes both code and markdown
npm run lint:code:fix # ESLint only
```

### Markdownlint

We use Markdownlint to ensure consistent and well-formatted documentation.

Configuration: `.markdownlint.json`

For resference see [Mardownlint Guid](https://github.com/DavidAnson/markdownlint/blob/main/README.md)

Key rules:

- Consistent heading style
- 2-space indentation for lists
- Line length limits (300 chars general, 80 for headings)
- Blank lines around lists and code blocks
- Consistent list marker style
- __No bold text as headings (MD036)__ - Use proper heading syntax (`##`, `###`, etc.) instead of `**Bold:**`

Run markdown linting:

```bash

# Check all markdown files
npm run lint:md:fix   # Auto-fix markdown issues (note: MD036 requires manual fix)
```

#### Heading vs Bold Text

```markdown
<!-- ❌ Bad - bold text used as heading -->
**Update Requirements:**
- Item 1
- Item 2

<!-- ✅ Good - proper heading -->
### Update Requirements

- Item 1
- Item 2
```

## Naming Conventions

- Files: Use kebab-case for file names (e.g., `user-service.ts`, `auth-controller.ts`)
- Classes: Use PascalCase (e.g., `UserService`, `AuthController`)
- Functions/Variables: Use camelCase (e.g., `getUserById`, `isActive`)
- Constants: Use UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`, `DEFAULT_TIMEOUT`)
- Private members: Prefix with underscore (e.g., `_internalState`, `_validateInput()`)

## Code Organization

### File Structure

### Function Length

- Keep functions focused and single-purpose
- Prefer functions under 50 lines
- Extract complex logic into separate functions

### Comments

- Avoid obvious comments
- Explain *why*, not *what* - the code shows what it does
- Use TSDoc for public APIs and complex functions (see [TypeScript Style Guide](./docs/TypeScript-Style-Guide.md#tsdoc-comments))

Example:

```typescript
/**
 * Validates user email format
 * @param email - The email to validate
 * @returns true if valid RFC 5322 format
 */
function validateEmail(email: string): boolean {
  // Implementation...
}
```

## Error Handling

- Always handle promise rejections
- Use typed errors when possible
- Provide meaningful error messages
- Log errors appropriately

## Testing

- Write tests for all public functions
- Use test naming convention: `describe()` for groups, `it()` for specs
- Aim for >80% code coverage
- Test behavior, not implementation details

## Git Commit Messages

Follow conventional commits format:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Example:

```
feat(auth): add JWT token refresh mechanism

Adds automatic token refresh when access token expires.
Implements exponential backoff for retry logic.

Closes #123
```

## Pre-commit Hooks

Husky is configured to run both code and markdown linting before commits. Commits with linting errors will be rejected.

The pre-commit hook runs:

- ESLint on TypeScript files
- Markdownlint on all markdown files

Run the pre-commit check manually:

```bash
npm run lint          # Runs both code and markdown linting
```

## Package Standards

Keep dependencies minimal, well-maintained, and secure.

For complete dependency security guidance, see [SECURITY.md](./SECURITY.md#dependency-management).

Quick checklist:

- Regularly audit: `npm audit`
- Document why each dependency is needed
- Use exact versions for critical dependencies
- Update promptly when security issues are found

## Environment Variables

- Store sensitive data in `.env` files (never commit)
- Document required environment variables in `.env.example`
- Use meaningful variable names: `DATABASE_URL`, not `DB`

## Performance Considerations

- Avoid N+1 queries in loops
- Use async/await properly to prevent blocking
- Cache expensive operations when appropriate
- Profile before optimizing

## Documentation

- Keep README up to date
- Document complex algorithms
- Add examples for public APIs
- Update [AGENTS.md](./AGENTS.md) when making significant changes
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for architectural documentation standards
- See [TypeScript Style Guide](./docs/TypeScript-Style-Guide.md) for TypeScript patterns and TSDoc
- All markdown files must pass markdownlint (`npm run lint:md`)

## Review Checklist

Before submitting code for review:

- [ ] Code passes linting (`npm run lint` - includes both code and markdown)
- [ ] Code is formatted (`npm run format`)
- [ ] Tests pass and coverage is adequate
- [ ] TypeScript compiles without errors
- [ ] Markdown files pass linting (included in `npm run lint`)
- [ ] No console.log statements in production code
- [ ] Commit message follows [conventions](#git-commit-messages)
- [ ] [AGENTS.md](./AGENTS.md) updated if applicable
- [ ] No hardcoded secrets or credentials
