/**
 * #1223 — the share routes resolve the token into a subject and hand off to
 * the ordinary doors. No `/share/*` handler contains an access decision.
 *
 * The framework names the hazard: a separate route tree is structurally
 * where a second door appears. Until now the four handlers decided through
 * `ShareManager.validate()` and `resolveScope()`, so every rule added to the
 * real doors was a rule the share routes missed. This is the static half of
 * the proof, in the style of the #1198 role-gate test: read the handlers'
 * source and refuse the shapes a decision takes. Sabotage: put
 * `resolved.media.find(...)` back in `shareFile` and this goes red.
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(process.cwd(), 'src', 'routes', 'WikiRoutes.ts'), 'utf8');

/** The body of one `async name(req, res) { … }` method, comments stripped. */
function methodBody(name: string): string {
  const start = src.indexOf(`  async ${name}(req: Request, res: Response)`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const end = src.indexOf('\n  }\n', start);
  return src.slice(start, end)
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

const HANDLERS = ['shareAlbum', 'shareFile', 'shareThumb', 'sharePage'];

/** The shapes an access decision took in the old handlers, and could take again. */
const DECISIONS: Array<[string, RegExp]> = [
  ['validating the token itself', /\.validate\(/],
  ['reading the share record', /\b(revokedAt|expiresAt|byToken)\b/],
  ['deciding membership from the resolved scope', /resolved\.(media|pages)\.(find|some|includes)\(/],
  ['re-implementing an exclusion', /\b(isPageExcluded|owner-only|isPrivate|audience)\b/],
  ['asking the share manager a question about a subject', /shareManager\.(subjectFor|validate)\(/]
];

describe('#1223 no /share/* handler contains an access decision', () => {
  test.each(HANDLERS)('%s decides nothing', (name) => {
    const body = methodBody(name);
    for (const [what, shape] of DECISIONS) {
      expect(shape.test(body), `${name}: ${what}`).toBe(false);
    }
  });

  test('each handler reaches its ordinary door', () => {
    expect(methodBody('shareFile')).toMatch(/this\.mediaFile\(req, res\)/);
    expect(methodBody('shareThumb')).toMatch(/this\.mediaThumb\(req, res\)/);
    expect(methodBody('sharePage')).toMatch(/this\.checkPageReadAccess\(req, /);
    // The album is a listing, filtered by the evaluator per item.
    expect(methodBody('shareAlbum')).toMatch(/this\.checkPageReadAccess\(req, /);
    expect(methodBody('shareAlbum')).toMatch(/getItem\(/);
  });

  test('the resolver is one middleware ahead of the handlers, not a helper each handler calls', () => {
    expect(src).toMatch(/app\.use\('\/share\/:token', /);
    expect(src).not.toMatch(/this\.shareGate\(/);
  });
});
