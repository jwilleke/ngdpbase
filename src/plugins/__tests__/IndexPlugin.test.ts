/**
 * Unit tests for IndexPlugin (#363)
 *
 * @jest-environment node
 */

import IndexPluginModule from '../IndexPlugin' ;
import type { SimplePlugin } from '../types';
const IndexPlugin = IndexPluginModule as unknown as SimplePlugin;
/** The viewer sees `pages`; the index holds those plus a page they may not open. */
function makeContext(pages) {
  return {
    userContext: { username: 'viewer', roles: ['reader', 'All'] },
    engine: {
      getManager: () => ({
        getAllPages: async () => [...pages, 'Zzz Private Diary'],
        listPagesFor: async (subject, action) =>
          subject?.username === 'viewer' && action === 'view' ? pages : []
      })
    }
  };
}

describe('IndexPlugin', () => {
  test('#1219: lists what the viewer may read, never the raw index', async () => {
    const html = await IndexPlugin.execute(makeContext(['Apple']), {});
    expect(html).toContain('href="/view/Apple"');
    expect(html).not.toContain('Private Diary');
  });

  test('groups pages by first letter', async () => {
    const html = await IndexPlugin.execute(makeContext(['Apple', 'Banana', 'Avocado']), {});
    expect(html).toContain('collapse');          // collapsible sections exist
    expect(html).toContain('>A<');               // letter heading
    expect(html).toContain('>B<');
    expect(html).toContain('href="/view/Apple"');
    expect(html).toContain('href="/view/Banana"');
    expect(html).toContain('href="/view/Avocado"');
  });

  test('non-letter pages grouped under #', async () => {
    const html = await IndexPlugin.execute(makeContext(['123Page', 'Apple']), {});
    expect(html).toContain('>#<');
    expect(html).toContain('>A<');
  });

  test('shows page count per section', async () => {
    const html = await IndexPlugin.execute(makeContext(['Alpha', 'Apex', 'Beta']), {});
    expect(html).toContain('2 pages'); // A section has 2
    expect(html).toContain('1 page');  // B section has 1
  });

  test('shows total page count', async () => {
    const html = await IndexPlugin.execute(makeContext(['Alpha', 'Beta', 'Gamma']), {});
    expect(html).toContain('3 pages');
  });

  test('jump-to nav links present when multiple sections', async () => {
    const html = await IndexPlugin.execute(makeContext(['Apple', 'Banana']), {});
    expect(html).toContain('Jump to:');
  });

  test('no jump-to nav when only one section', async () => {
    const html = await IndexPlugin.execute(makeContext(['Alpha', 'Apex']), {});
    expect(html).not.toContain('Jump to:');
  });

  test('expand/collapse all buttons present', async () => {
    const html = await IndexPlugin.execute(makeContext(['Apple']), {});
    expect(html).toContain('Expand all');
    expect(html).toContain('Collapse all');
  });

  test('include filter', async () => {
    const html = await IndexPlugin.execute(makeContext(['Apple', 'Banana', 'Avocado']), { include: '^A' });
    expect(html).toContain('href="/view/Apple"');
    expect(html).toContain('href="/view/Avocado"');
    expect(html).not.toContain('href="/view/Banana"');
  });

  test('exclude filter', async () => {
    const html = await IndexPlugin.execute(makeContext(['Apple', 'Banana', 'Avocado']), { exclude: '^A' });
    expect(html).not.toContain('href="/view/Apple"');
    expect(html).toContain('href="/view/Banana"');
  });

  test('empty page list returns empty index', async () => {
    const html = await IndexPlugin.execute(makeContext([]), {});
    expect(html).toContain('index-plugin');
    expect(html).not.toContain('<li>');
  });

  test('returns error when PageManager unavailable', async () => {
    const html = await IndexPlugin.execute({ engine: { getManager: () => null } }, {});
    expect(html).toContain('error');
  });

  test('XSS: page names are escaped', async () => {
    const html = await IndexPlugin.execute(makeContext(['<script>alert(1)</script>']), {});
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
