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
import { checkFile, run, isInsideTemplateLiteral } from '../../../scripts/check-http-boundary';

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

describe('#1139 — the real tree', () => {
  test('nothing outside src/http opens the network today', () => {
    // Weakest assertion in the file, kept last on purpose: a check that matched
    // nothing would pass this too. Everything above is what gives it meaning.
    expect(run()).toEqual([]);
  });
});
