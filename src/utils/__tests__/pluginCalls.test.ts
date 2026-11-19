/**
 * workingParts and describeWorkingChanges: what "changes how a page works"
 * means for a kept page (#2389, slice 2, R4 of
 * docs/design/required-pages-sync-states.md).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { workingParts, describeWorkingChanges, parsePluginParameters, PLUGIN_CALL_SOURCE, WORKING_FRONTMATTER_KEYS, WORDING_FRONTMATTER_KEYS } from '../pluginCalls';

const parts = (body: string, frontmatter: Record<string, unknown> = {}) => workingParts(body, frontmatter);

describe('workingParts: plugin calls and form elements', () => {
  test('a changed parameter differs', () => {
    expect(parts('[{Calendar calendars=family}]')).not.toEqual(parts('[{Calendar calendars=work}]'));
  });

  test('reordered parameters are equal, and so are whitespace differences', () => {
    expect(parts('[{Calendar a=1 b=2}]')).toEqual(parts('[{Calendar   b=2   a=1 }]'));
  });

  test('an added call differs, a reordered pair of calls does not', () => {
    expect(parts('Text.')).not.toEqual(parts('Text.\n[{Calendar}]'));
    expect(parts('[{Counter}] and [{Calendar}]')).toEqual(parts('[{Calendar}] and [{Counter}]'));
  });

  test('form elements and ACL markup count: they have the same shape', () => {
    expect(parts('[{FormOpen name=signup}][{FormInput name=email}]')).toHaveLength(2);
    expect(parts('[{ALLOW view Admin}]')).toHaveLength(1);
  });

  test('calls inside a code fence or inline code are shown, not run, so they are ignored', () => {
    expect(parts('```\n[{Calendar}]\n```')).toEqual([]);
    expect(parts('~~~\n[{Calendar}]\n~~~')).toEqual([]);
    expect(parts('Type `[{Calendar}]` to add one.')).toEqual([]);
  });

  test('an escaped call [[{...}] and a variable [{$name}] are ignored', () => {
    expect(parts('[[{Calendar}]')).toEqual([]);
    expect(parts('Welcome to [{$applicationname}].')).toEqual([]);
  });

  test('presentation-only parameters do not count', () => {
    expect(parts('[{Image src=a.png class=wide width=100}]')).toEqual(parts('[{Image src=a.png}]'));
  });

  test('wording between an opening and closing call is not a working part, only the opening call is', () => {
    expect(parts('[{Note}]one wording[{/Note}]')).toEqual(parts('[{Note}]another wording[{/Note}]'));
  });

  test('the same shipped text always gives the same list', () => {
    const body = '[{B x=1}][{A y=2}]';
    expect(parts(body)).toEqual(parts(body));
    expect(parts(body)).toEqual([...parts(body)].sort());
  });
});

describe('workingParts: front-matter that changes behaviour', () => {
  test('a changed system-category differs', () => {
    expect(parts('x', { 'system-category': 'system' })).not.toEqual(parts('x', { 'system-category': 'documentation' }));
  });

  test('a changed title, description or keywords does not', () => {
    expect(parts('x', { title: 'A', description: 'a', 'user-keywords': ['a'] })).toEqual(parts('x', { title: 'B', description: 'b', 'user-keywords': ['b'] }));
  });

  test('a changed hash, release label or kept mark does not', () => {
    expect(parts('x', { 'required-source-hash': '1', 'kept-edited': true })).toEqual(parts('x', { 'required-source-hash': '2' }));
  });
});

describe('describeWorkingChanges: plain words for the review list', () => {
  test('an added call says what the page now calls, with its parameters', () => {
    const before = parts('Text.');
    const after = parts('Text.\n[{Calendar calendars=family}]');
    expect(describeWorkingChanges(before, after)).toEqual(['This page now calls Calendar with calendars=family.']);
  });

  test('a removed call says the page no longer calls it', () => {
    expect(describeWorkingChanges(parts('[{Counter}]'), parts('Text.'))).toEqual(['This page no longer calls Counter.']);
  });

  test('a changed setting is named', () => {
    const text = describeWorkingChanges(parts('x', { audience: 'admin' }), parts('x', { audience: 'all' })).join(' ');
    expect(text).toContain('audience');
    expect(text).toContain('all');
  });

  test('nothing differs, nothing is listed', () => {
    expect(describeWorkingChanges(parts('[{Counter}]'), parts('[{Counter}]'))).toEqual([]);
  });
});

describe('the parser the renderer uses', () => {
  test('parses quoted, unquoted and JSON values like PluginSyntaxHandler', () => {
    expect(parsePluginParameters('a=\'x y\' b="z" c=3 d=true')).toEqual({ a: 'x y', b: 'z', c: 3, d: true });
  });

  test("the call pattern is the renderer's, with the escape rule", () => {
    const re = new RegExp(PLUGIN_CALL_SOURCE, 'g');
    expect('[{A}] [[{B}] [{$c}]'.match(re)).toEqual(['[{A}]']);
  });
});

describe('every front-matter key a shipped page uses is classified', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const dirs = [path.join(root, 'required-pages')];
  for (const addon of fs.readdirSync(path.join(root, 'addons'))) {
    const pages = path.join(root, 'addons', addon, 'pages');
    if (fs.existsSync(pages)) dirs.push(pages);
  }

  test('no key is in neither list, so a new behaviour key cannot pass as wording', () => {
    const known = new Set<string>([...WORKING_FRONTMATTER_KEYS, ...WORDING_FRONTMATTER_KEYS]);
    const unclassified = new Set<string>();
    for (const dir of dirs) {
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
        for (const key of Object.keys(matter(fs.readFileSync(path.join(dir, file), 'utf8'), {}).data)) {
          if (!known.has(key)) unclassified.add(`${path.relative(root, path.join(dir, file))}: ${key}`);
        }
      }
    }
    expect([...unclassified]).toEqual([]);
  });

  test('no key is in both lists', () => {
    expect(WORKING_FRONTMATTER_KEYS.filter((k) => WORDING_FRONTMATTER_KEYS.includes(k))).toEqual([]);
  });
});
