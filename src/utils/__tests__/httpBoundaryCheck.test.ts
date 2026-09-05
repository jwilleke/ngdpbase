/**
 * #1139 — the check that keeps #1133's outbound boundary closed.
 *
 * A guard that is not enforced decays one convenient direct call at a time,
 * with nothing going red. These tests are about the CHECK, so the thing that
 * matters is not that it passes on a clean tree — it is that it fails on the
 * violations it claims to catch, and does not fail on the two things it is
 * specifically designed to tolerate.
 *
 * The real tree passing is asserted last, and is the weakest assertion here:
 * a check that matched nothing at all would also pass it.
 */
import { checkFile, collectSources, run, isInsideTemplateLiteral } from '../../../scripts/check-http-boundary';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const at = (src: string): ReturnType<typeof checkFile> => checkFile('src/example.ts', src);

describe('#1139 — outbound calls outside the boundary are caught', () => {
  test('a bare fetch() is a violation', () => {
    const v = at('const r = await fetch(\'https://example.com\');');
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('fetch');
  });

  test('the exact call this issue found in WikiRoutes would have been caught', () => {
    // This was real: an unguarded outbound call to api.github.com from
    // src/routes/, bypassing the egress policy that two sibling call sites
    // already went through. Migrated to guardedFetch as part of #1139.
    const v = at([
      'const apiUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`;',
      'const resp = await fetch(apiUrl, {',
      "  headers: { 'User-Agent': 'ngdpbase-update-check' },",
      '});'
    ].join('\n'));
    expect(v.map((x) => x.rule)).toEqual(['fetch']);
    expect(v[0].line).toBe(2);
  });

  test('an HTTP client library import is a violation', () => {
    for (const mod of ['axios', 'got', 'node-fetch', 'undici', 'superagent']) {
      const v = at(`import client from '${mod}';`);
      expect(v).toHaveLength(1);
      expect(v[0].rule).toBe('client-library');
    }
  });

  test('#1188 the Elasticsearch SDK is a client, and a type-only import of it is not', () => {
    // Both `new Client({ node })` sites read green for months because the SDK
    // was not named here. The guarded constructor lives in src/http.
    const v = at("import { Client } from '@elastic/elasticsearch';");
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('client-library');
    expect(at("import { HttpConnection } from '@elastic/transport';")[0].rule).toBe('client-library');
    expect(at("import type { Client, estypes } from '@elastic/elasticsearch';")).toEqual([]);
  });

  test('a client symbol from http or https is a violation', () => {
    expect(at('import { request } from \'https\';')[0].rule).toBe('client-symbol');
    expect(at('import { get } from \'node:http\';')[0].rule).toBe('client-symbol');
  });

  test('a client call through a namespace import is a violation', () => {
    const v = at(["import https from 'https';", 'const r = https.request(url);'].join('\n'));
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('client-call');
    expect(v[0].line).toBe(2);
  });

  test('net used as a client is a violation', () => {
    const v = at(["import net from 'net';", 'const s = net.connect(25, host);'].join('\n'));
    expect(v.map((x) => x.rule)).toEqual(['client-call']);
  });

  test('dns is forbidden outright — resolving is how SSRF picks its target', () => {
    expect(at('import dns from \'dns\';')[0].rule).toBe('dns');
    expect(at('import { lookup } from \'node:dns/promises\';')[0].rule).toBe('dns');
  });
});

describe('#1139 — inbound is not the risk, and is not flagged', () => {
  test('listening with https.createServer is allowed', () => {
    // src/app.ts does exactly this to terminate TLS (#1153).
    expect(at([
      "import https from 'https';",
      'const server = https.createServer({ cert, key }, app);'
    ].join('\n'))).toEqual([]);
  });

  test('net.createServer is allowed — the #1163 redirect multiplexer needs it', () => {
    expect(at([
      "import net from 'net';",
      'net.createServer((socket) => routeSocket(socket, deps)).listen(port);'
    ].join('\n'))).toEqual([]);
  });

  test('a type-only import cannot open anything', () => {
    // `import type { Socket } from 'net'` is erased at compile time.
    expect(at('import type { Socket } from \'net\';')).toEqual([]);
  });

  test('prose about fetch does not trip the check', () => {
    // Several files discuss fetch in comments — including this issue's own
    // rationale. A check that flagged its own documentation would be deleted.
    expect(at('// a bare fetch() here would bypass the egress policy')).toEqual([]);
    expect(at('/*\n * Raw fetch(url) is forbidden outside the boundary.\n */')).toEqual([]);
  });

  test('a method named fetch on an object is not global fetch', () => {
    expect(at('const bytes = await deps.fetchBytes(url, timeoutMs);')).toEqual([]);
    expect(at('const r = await this.fetch(url);')).toEqual([]);
  });
});

describe('#1185 — a statement fetch(url); is a call, not a declaration', () => {
  // The declaration exemption skipped `fetch(...)` when followed by `:`, `{`
  // OR `;`. The `;` also matched a fire-and-forget statement, so a raw
  // `fetch(url);` in src/ or addons/ kept CI green — the exact hole the check
  // exists to close. Nothing in the tree ever needed the `;`.
  test('fetch(url); is a violation', () => {
    const v = at('fetch(url);');
    expect(v.map((x) => x.rule)).toEqual(['fetch']);
  });

  test('fetch(cfg.url); is a violation', () => {
    expect(at('fetch(cfg.url);').map((x) => x.rule)).toEqual(['fetch']);
  });

  test('void fetch(url); is a violation', () => {
    expect(at('void fetch(url);').map((x) => x.rule)).toEqual(['fetch']);
  });

  test('an interface signature with a return type is still a declaration', () => {
    expect(at('  fetch(cfg: SourceConfig, policy: EgressPolicy): Promise<RawRecord[]>;')).toEqual([]);
  });

  test('a one-line async method declaration is still a declaration', () => {
    expect(at('  async fetch(cfg: SourceConfig, policy: EgressPolicy): Promise<RawRecord[]> {')).toEqual([]);
    expect(at('  async fetch(cfg, policy) {')).toEqual([]);
  });
});

describe('#1139 — the plugin template-literal trap', () => {
  // CommentsPlugin and FootnotesPlugin emit browser JavaScript inside template
  // strings. It runs in the VISITOR'S browser against a relative URL and never
  // in Node. A naive \bfetch\( flags both; exempting src/plugins/ would blind
  // the check to a real server-side fetch in a plugin, which plugins do make.
  const pluginShape = [
    'function render(uuid) {',
    '  return `<script>',
    "    return fetch('/api/comments/' + uuid + '/html')",
    '      .then(r => r.text());',
    '  </script>`;',
    '}'
  ].join('\n');

  test('browser fetch inside an emitted template string is not flagged', () => {
    expect(checkFile('src/plugins/CommentsPlugin.ts', pluginShape)).toEqual([]);
  });

  test('but a real server-side fetch in the same file still is', () => {
    // The point of matching on position rather than path: the plugin keeps its
    // emitted browser code AND is still held to the boundary for its own code.
    const mixed = `${pluginShape}\nasync function load() { return fetch('https://example.com'); }`;
    const v = checkFile('src/plugins/CommentsPlugin.ts', mixed);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('fetch');
  });

  test('the template-literal detector tracks backtick parity', () => {
    const lines = ['const a = `open', 'inside', '`; const b = 1;', 'outside'];
    expect(isInsideTemplateLiteral(lines, 1)).toBe(true);
    expect(isInsideTemplateLiteral(lines, 3)).toBe(false);
  });

  test('an escaped backtick does not flip the parity', () => {
    const lines = ['const a = "\\`";', 'outside'];
    expect(isInsideTemplateLiteral(lines, 1)).toBe(false);
  });
});

describe('#1189 — the scan visits the addon code that actually loads', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-http-boundary-'));
    const put = (rel: string, body: string) => fs.outputFile(path.join(repo, rel), body);
    await put('src/http/guardedFetch.ts', 'export const guardedFetch = fetch;');
    await put('src/routes/a.ts', 'export const a = 1;');
    // A JS-only addon: no .ts anywhere, an outbound call in its server code.
    await put('addons/jsonly/index.js', "import axios from 'axios';\nexport const register = () => axios.get(url);");
    // Browser code an addon serves — fetch() is what browsers do.
    await put('addons/jsonly/public/app.js', "fetch('/api/x');");
    // A compiled addon: the .js beside its .ts is build output, read once via the .ts.
    await put('addons/compiled/index.ts', "export const r = await fetch('https://example.com');");
    await put('addons/compiled/index.js', "export const r = await fetch('https://example.com');");
    await put('addons/compiled/dist/index.js', "fetch('https://example.com');");
    await put('addons/compiled/index.d.ts', 'export declare const r: unknown;');
    await put('addons/compiled/__tests__/index.test.ts', "fetch('https://example.com');");
  });

  afterEach(async () => {
    // This test's own temp dir only — never a live data tree.
    await fs.remove(repo);
  });

  test('a .js file with no .ts beside it is source and is scanned', () => {
    expect(collectSources(repo)).toContain(path.join('addons', 'jsonly', 'index.js'));
    const v = run(repo).filter((x) => x.file.startsWith(path.join('addons', 'jsonly')));
    expect(v.map((x) => x.rule).sort()).toEqual(['client-library']);
  });

  test('browser files under public/, build output under dist/, tests and declarations are not', () => {
    const seen = collectSources(repo);
    expect(seen).not.toContain(path.join('addons', 'jsonly', 'public', 'app.js'));
    expect(seen).not.toContain(path.join('addons', 'compiled', 'dist', 'index.js'));
    expect(seen).not.toContain(path.join('addons', 'compiled', 'index.d.ts'));
    expect(seen.some((f) => f.includes('__tests__'))).toBe(false);
  });

  test('a compiled .js beside its .ts is read once, through the .ts', () => {
    const seen = collectSources(repo);
    expect(seen).toContain(path.join('addons', 'compiled', 'index.ts'));
    expect(seen).not.toContain(path.join('addons', 'compiled', 'index.js'));
    const v = run(repo).filter((x) => x.file.startsWith(path.join('addons', 'compiled')));
    expect(v).toHaveLength(1);
    expect(v[0].file).toBe(path.join('addons', 'compiled', 'index.ts'));
  });

  test('the boundary itself is exempt and src/ is still walked', () => {
    const seen = collectSources(repo);
    expect(seen).toContain(path.join('src', 'routes', 'a.ts'));
    expect(seen).not.toContain(path.join('src', 'http', 'guardedFetch.ts'));
  });

  test('the real tree: the scan reaches a bundled addon and none of its public/ files', () => {
    const seen = collectSources();
    expect(seen).toContain(path.join('addons', 'forms', 'index.ts'));
    expect(seen.some((f) => f.startsWith('addons' + path.sep))).toBe(true);
    expect(seen.some((f) => f.includes(path.sep + 'public' + path.sep))).toBe(false);
    expect(seen.some((f) => f.includes(path.sep + 'dist' + path.sep))).toBe(false);
  });
});

describe('#1139 — the real tree', () => {
  test('nothing outside src/http opens the network today', () => {
    // Weakest assertion in the file, kept last on purpose: a check that matched
    // nothing would pass this too. Everything above is what gives it meaning.
    expect(run()).toEqual([]);
  });
});
