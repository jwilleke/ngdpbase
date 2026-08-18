# TypeScript Configuration

__Target__: ES2022
__Module System__: CommonJS (with future ES modules support planned)
__Runtime__: Node.js 18+

## Compiler Options

### ES Version: ES2022

ES2022 features available:

- Top-level await
- Class fields and private methods
- `at()` method for arrays
- `Object.hasOwn()`
- Error cause property
- WeakRef and FinalizationRegistry

### Strict Mode

Currently `strict: false` during TypeScript migration (Issue #139).

__Post-migration__: Will enable `strict: true` with:

- strictNullChecks
- noImplicitAny
- strictFunctionTypes
- strictBindCallApply
- strictPropertyInitialization
- noImplicitThis
- alwaysStrict

## Migration Strategy

See: `/docs/planning/TypeScript-Migration-Plan.md`

## References

- __CODE_STANDARDS.md__: Code standards and conventions
- __tsconfig.json__: Complete TypeScript compiler configuration
- __Issue #139__: TypeScript Migration Epic
