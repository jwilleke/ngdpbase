#!/usr/bin/env tsx
/**
 * Every audit row takes its "who" from the caller's context (#1762 slice 3).
 *
 * Operator decision on #1762: a row for something done under a proxy grant
 * names the represented person in `user` and the person who actually did it
 * in a top-level `actor`. That only holds if every emitter builds the "who"
 * from the context — `actorOf` / `attributedTo` (spread, so `actor` comes
 * along), or `proxyAttribution` for a subject that may be anonymous. An
 * emitter that writes `user: ctx.username` records the represented person and
 * silently drops the proxy: the row then says Mom did what Jim did.
 *
 * Two rules, read from the TypeScript AST (not a grep, so a reformatted
 * literal cannot slip past):
 *
 * 1. __Audit-event literals__ — an object literal with a top-level
 *    `eventType` property and a `user` property must also spread an
 *    attribution (`...who`, `...actorOf(…)`, `...attributedTo(…)`,
 *    `...auditWho(…)`, `...proxy`), or set `user` to a string literal (a
 *    fixed principal: `'system'`, `'anonymous'`). A literal with no `user` is
 *    a partial event stamped elsewhere (`recordSystemAction`).
 * 2. __Content builders__ — a `build…AuditEvent({ username, … })` call must
 *    forward `viaProxy` beside `username`, as it forwards `viaToken`.
 *
 * Anything else is listed below with the reason it is not the defect. A stale
 * entry fails the run, so the list cannot outlive what it excuses.
 *
 * Run via `npm run lint:audit-attribution`. Wired into `npm run lint` /
 * `lint:ci` / `.husky/pre-commit`. Exits 1 on any violation.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '..');

const SCAN = ['src', 'addons'];

/** A spread that carries the attribution — and so `actor` under a proxy grant. */
const ATTRIBUTION_SPREAD = /^(who|actor|proxy)(\.fields)?$|\bactorOf\(|\battributedTo\(|\bauditWho\(/;

/**
 * `file::user expression` → why that emitter records a bare name.
 * Keyed by the `user` (or builder `username`) expression as written, so a
 * new emitter in the same file is not excused by an old entry.
 */
const ALLOWED: Record<string, string> = {
  'src/managers/AuditManager.ts::context.user?.username || \'anonymous\'':
    'logAccessDecision / logPolicyEvaluation take a legacy AccessContext with an AuditUser, not a subject. Nothing in src calls either: the PDP records its own decisions through PolicyInformationPoint.auditDenial, which reads the subject',
  'src/managers/AuditManager.ts::context.username || \'unknown\'':
    'logAuthentication records a sign-in attempt: the person signing in, before any proxy choice exists: whom to act for is chosen after sign-in (slice 4), and a choice is recorded as proxy-switch',
  'src/providers/FileAuditProvider.ts::(evt.user as string) || legacy.actor || \'anonymous\'':
    'prepareRecord normalises an incoming row into the stored shape — not an emitter. It keeps `actor` beside `user` (#1762)',
  'src/managers/AuthManager.ts::grant.owner':
    'proxy-grant / proxy-revoke (slice 1): `user` is the account the grant is ON, and `actor` is set explicitly from actorOf (the proxy, when a proxy re-delegates)',
  'src/managers/AuthManager.ts::typeof req.session?.username === \'string\' ? req.session.username : \'anonymous\'':
    'step-up (reauth) records the SIGNED-IN person\'s own fresh sign-in; under a proxy that is the actor, which is what session.username names (slice 4: session.username stays the actor; the grant acted under is session.actingFor)',
  'src/utils/auditLifecycle.ts::input.principal ?? \'system\'':
    'system-start / system-shutdown: the configured system principal at boot, with no request and no person'
};

export interface Violation {
  file: string;
  line: number;
  rule: 'bare-user' | 'builder-without-proxy' | 'stale-allowlist';
  detail: string;
}

function tsFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    let entries: string[];
    try { entries = readdirSync(current); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') continue;
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) continue;
      found.push(full);
    }
  };
  walk(dir);
  return found;
}

function propName(p: ts.ObjectLiteralElementLike): string | undefined {
  if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
    return p.name.text;
  }
  return undefined;
}

function prop(obj: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | undefined {
  return obj.properties.find((p) => propName(p) === name);
}

function spreadsAttribution(obj: ts.ObjectLiteralExpression, sf: ts.SourceFile): boolean {
  return obj.properties.some((p) => ts.isSpreadAssignment(p) && ATTRIBUTION_SPREAD.test(p.expression.getText(sf)));
}

function valueText(p: ts.ObjectLiteralElementLike, sf: ts.SourceFile): string {
  if (ts.isPropertyAssignment(p)) return p.initializer.getText(sf).replace(/\s+/g, ' ');
  return propName(p) ?? '';
}

function isStringLiteralValue(p: ts.ObjectLiteralElementLike): boolean {
  return ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer));
}

export function scan(): Violation[] {
  const violations: Violation[] = [];
  const used = new Set<string>();

  const excused = (rel: string, expr: string): boolean => {
    const key = `${rel}::${expr}`;
    if (ALLOWED[key]) { used.add(key); return true; }
    return false;
  };

  for (const root of SCAN) {
    for (const file of tsFiles(path.join(REPO, root))) {
      const rel = path.relative(REPO, file);
      const source = readFileSync(file, 'utf8');
      if (!source.includes('eventType') && !/build\w*AuditEvent\(/.test(source)) continue;
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const at = (node: ts.Node): number => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

      const visit = (node: ts.Node): void => {
        // Rule 1: an audit-event literal.
        if (ts.isObjectLiteralExpression(node) && prop(node, 'eventType')) {
          const user = prop(node, 'user');
          if (user && !spreadsAttribution(node, sf) && !isStringLiteralValue(user)) {
            const expr = valueText(user, sf);
            if (!excused(rel, expr)) {
              violations.push({
                file: rel, line: at(user), rule: 'bare-user',
                detail: `audit row sets user: ${expr} — spread the context's attribution (...actorOf(ctx)) so a proxy's actor is recorded`
              });
            }
          }
        }
        // Rule 2: a content builder call.
        if (ts.isCallExpression(node)) {
          const callee = node.expression.getText(sf);
          const arg = node.arguments[0];
          if (/(^|\.)build\w*AuditEvent$/.test(callee) && arg && ts.isObjectLiteralExpression(arg)) {
            const username = prop(arg, 'username');
            if (username && !prop(arg, 'viaProxy')) {
              const expr = valueText(username, sf);
              if (!excused(rel, expr)) {
                violations.push({
                  file: rel, line: at(username), rule: 'builder-without-proxy',
                  detail: `${callee}({ username: ${expr} }) without viaProxy — forward the context's viaProxy beside viaToken`
                });
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }

  for (const key of Object.keys(ALLOWED)) {
    if (!used.has(key)) {
      const [file] = key.split('::');
      violations.push({ file, line: 0, rule: 'stale-allowlist', detail: `ALLOWED entry "${key}" no longer matches anything — remove it` });
    }
  }
  return violations;
}

function run(): void {
  console.log('Audit attribution (#1762)');
  console.log('=========================');
  const violations = scan();
  if (violations.length === 0) {
    console.log('Every audit row in src, addons takes its "who" from the context, or is listed with a reason.');
    return;
  }
  for (const v of violations) {
    console.error(`  ${v.file}${v.line ? `:${v.line}` : ''}  [${v.rule}] ${v.detail}`);
  }
  console.error(`\n${violations.length} violation(s). See docs/audit-posture.md (who a row names).`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run();
}
