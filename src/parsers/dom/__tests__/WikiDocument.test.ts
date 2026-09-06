/**
 * WikiDocument Unit Tests
 *
 * Tests for the WikiDocument DOM-based implementation
 *
 * Related: GitHub Issue #93 - Phase 1.1
 */

import WikiDocument from '../WikiDocument';

describe('WikiDocument', () => {
  describe('Constructor', () => {
    test('creates a document with page data', () => {
      const doc = new WikiDocument('Test content', { page: 'TestPage' });

      expect(doc).toBeDefined();
      expect(doc.getPageData()).toBe('Test content');
      expect(doc.getContext()).toEqual({ page: 'TestPage' });
    });

    test('creates a document without context', () => {
      const doc = new WikiDocument('Test content', null);

      expect(doc).toBeDefined();
      expect(doc.getPageData()).toBe('Test content');
      expect(doc.getContext()).toBeNull();
    });

    test('initializes with metadata', () => {
      const doc = new WikiDocument('Test', {});
      const metadata = doc.getMetadata();

      expect(metadata).toHaveProperty('createdAt');
      expect(metadata).toHaveProperty('version', '1.0.0');
    });
  });

  describe('Page Data Management', () => {
    test('getPageData returns original content', () => {
      const content = 'Original wiki markup';
      const doc = new WikiDocument(content, {});

      expect(doc.getPageData()).toBe(content);
    });

    test('setPageData updates content', () => {
      const doc = new WikiDocument('Original', {});
      doc.setPageData('Updated');

      expect(doc.getPageData()).toBe('Updated');
    });
  });

  describe('Context Management', () => {
    test('getContext returns context if alive', () => {
      const context = { page: 'TestPage', user: 'john' };
      const doc = new WikiDocument('Test', context);

      expect(doc.getContext()).toEqual(context);
    });

    test('setContext updates context', () => {
      const doc = new WikiDocument('Test', { initial: true });
      const newContext = { page: 'NewPage' };

      doc.setContext(newContext);

      expect(doc.getContext()).toEqual(newContext);
    });

    test('setContext with null clears context', () => {
      const doc = new WikiDocument('Test', { page: 'TestPage' });
      doc.setContext(null);

      expect(doc.getContext()).toBeNull();
    });
  });

  describe('Metadata Management', () => {
    test('setMetadata stores values', () => {
      const doc = new WikiDocument('Test', {});

      doc.setMetadata('author', 'John Doe');
      doc.setMetadata('tags', ['test', 'demo']);

      expect(doc.getMetadataValue('author')).toBe('John Doe');
      expect(doc.getMetadataValue('tags')).toEqual(['test', 'demo']);
    });

    test('getMetadataValue returns default for missing key', () => {
      const doc = new WikiDocument('Test', {});

      expect(doc.getMetadataValue('nonexistent')).toBeNull();
      expect(doc.getMetadataValue('nonexistent', 'default')).toBe('default');
    });

    test('getMetadata returns copy of all metadata', () => {
      const doc = new WikiDocument('Test', {});
      doc.setMetadata('key1', 'value1');
      doc.setMetadata('key2', 'value2');

      const metadata = doc.getMetadata();

      expect(metadata).toHaveProperty('key1', 'value1');
      expect(metadata).toHaveProperty('key2', 'value2');
      expect(metadata).toHaveProperty('createdAt');
      expect(metadata).toHaveProperty('version');
    });
  });

  describe('DOM Creation', () => {
    test('createElement creates element with attributes', () => {
      const doc = new WikiDocument('Test', {});
      const element = doc.createElement('div', { id: 'test', class: 'wiki-div' });

      expect(element.tagName.toLowerCase()).toBe('div');
      expect(element.getAttribute('id')).toBe('test');
      expect(element.getAttribute('class')).toBe('wiki-div');
    });

    test('createElement works without attributes', () => {
      const doc = new WikiDocument('Test', {});
      const element = doc.createElement('p');

      expect(element.tagName.toLowerCase()).toBe('p');
    });

    test('createTextNode creates text node', () => {
      const doc = new WikiDocument('Test', {});
      const text = doc.createTextNode('Hello World');

      expect(text.nodeType).toBe(3); // TEXT_NODE
      expect(text.textContent).toBe('Hello World');
    });

    test('createCommentNode creates comment node', () => {
      const doc = new WikiDocument('Test', {});
      const comment = doc.createCommentNode('This is a comment');

      expect(comment.nodeType).toBe(8); // COMMENT_NODE
      expect(comment.textContent).toBe('This is a comment');
    });
  });

  describe('DOM Manipulation', () => {
    test('appendChild adds child to root', () => {
      const doc = new WikiDocument('Test', {});
      const element = doc.createElement('p');
      const text = doc.createTextNode('Paragraph text');

      element.appendChild(text);
      doc.appendChild(element);

      expect(doc.getChildCount()).toBe(1);
      expect(doc.isEmpty()).toBe(false);
    });

    test('removeChild removes child from root', () => {
      const doc = new WikiDocument('Test', {});
      const element = doc.createElement('p');

      doc.appendChild(element);
      expect(doc.getChildCount()).toBe(1);

      doc.removeChild(element);
      expect(doc.getChildCount()).toBe(0);
      expect(doc.isEmpty()).toBe(true);
    });

    test('insertBefore inserts node before reference', () => {
      const doc = new WikiDocument('Test', {});
      const first = doc.createElement('p');
      first.textContent = 'First';
      const second = doc.createElement('p');
      second.textContent = 'Second';

      doc.appendChild(second);
      doc.insertBefore(first, second);

      const children = doc.getRootElement().childNodes;
      expect(children[0].textContent).toBe('First');
      expect(children[1].textContent).toBe('Second');
    });

    test('replaceChild replaces node', () => {
      const doc = new WikiDocument('Test', {});
      const old = doc.createElement('p');
      old.textContent = 'Old';
      const newEl = doc.createElement('div');
      newEl.textContent = 'New';

      doc.appendChild(old);
      doc.replaceChild(newEl, old);

      const child = doc.getRootElement().childNodes[0] as Element;
      expect(child.textContent).toBe('New');
      expect(child.tagName.toLowerCase()).toBe('div');
    });
  });

  describe('DOM Query', () => {
    let doc;

    beforeEach(() => {
      doc = new WikiDocument('Test', {});

      // Create test structure
      const heading = doc.createElement('h1', { id: 'title' });
      heading.textContent = 'Test Page';
      doc.appendChild(heading);

      for (let i = 0; i < 5; i++) {
        const para = doc.createElement('p', { id: `para-${i}`, class: 'wiki-para' });
        para.textContent = `Paragraph ${i}`;
        doc.appendChild(para);
      }

      const list = doc.createElement('ul', { class: 'wiki-list' });
      for (let i = 0; i < 3; i++) {
        const item = doc.createElement('li');
        item.textContent = `Item ${i}`;
        list.appendChild(item);
      }
      doc.appendChild(list);
    });

    test('querySelector finds element by ID', () => {
      const result = doc.querySelector('#title');

      expect(result).not.toBeNull();
      expect(result.textContent).toBe('Test Page');
    });

    test('querySelector finds element by class', () => {
      const result = doc.querySelector('.wiki-para');

      expect(result).not.toBeNull();
      expect(result.textContent).toBe('Paragraph 0');
    });

    test('querySelectorAll finds multiple elements', () => {
      const results = doc.querySelectorAll('.wiki-para');

      expect(results.length).toBe(5);
      expect(results[2].textContent).toBe('Paragraph 2');
    });

    test('getElementById finds element', () => {
      const result = doc.getElementById('para-3');

      expect(result).not.toBeNull();
      expect(result.textContent).toBe('Paragraph 3');
    });

    test('getElementsByClassName finds elements', () => {
      const results = doc.getElementsByClassName('wiki-para');

      expect(results.length).toBe(5);
    });

    test('getElementsByTagName finds elements', () => {
      const results = doc.getElementsByTagName('li');

      expect(results.length).toBe(3);
    });
  });

  describe('Serialization', () => {
    test('toHTML returns HTML string', () => {
      const doc = new WikiDocument('Test', {});
      const para = doc.createElement('p', { id: 'test' });
      para.textContent = 'Test paragraph';
      doc.appendChild(para);

      const html = doc.toHTML();

      expect(html).toContain('<p id="test">');
      expect(html).toContain('Test paragraph');
      expect(html).toContain('</p>');
    });

    test('toString returns description', () => {
      const doc = new WikiDocument('Test content', {});
      doc.appendChild(doc.createElement('p'));
      doc.appendChild(doc.createElement('div'));

      const str = doc.toString();

      expect(str).toContain('WikiDocument');
      expect(str).toContain('2 nodes');
      expect(str).toContain('12 chars');
    });

    test('toJSON serializes document', () => {
      const doc = new WikiDocument('Original markup', {});
      doc.setMetadata('author', 'John');

      const para = doc.createElement('p');
      para.textContent = 'Test';
      doc.appendChild(para);

      const json = doc.toJSON();

      expect(json).toHaveProperty('pageData', 'Original markup');
      expect(json).toHaveProperty('html');
      expect(json).toHaveProperty('metadata');
      expect(json).toHaveProperty('version', '1.0.0');
      expect(json).toHaveProperty('timestamp');
      expect(json.metadata).toHaveProperty('author', 'John');
      expect(json.html).toContain('<p>Test</p>');
    });

    test('fromJSON restores document', () => {
      const original = new WikiDocument('Original content', {});
      original.setMetadata('author', 'John');

      const para = original.createElement('p');
      para.textContent = 'Test paragraph';
      original.appendChild(para);

      const json = original.toJSON();
      const restored = WikiDocument.fromJSON(json, { page: 'TestPage' });

      expect(restored.getPageData()).toBe('Original content');
      expect(restored.getMetadataValue('author')).toBe('John');
      expect(restored.toHTML()).toContain('<p>Test paragraph</p>');
      expect(restored.getContext()).toEqual({ page: 'TestPage' });
    });

    test('fromJSON works without context', () => {
      const json = { pageData: 'Test', html: '<p>Test</p>', metadata: {}, version: '1.0.0' };
      const doc = WikiDocument.fromJSON(json);

      expect(doc.getPageData()).toBe('Test');
      expect(doc.getContext()).toBeNull();
    });
  });

  describe('Utility Methods', () => {
    test('clear removes all content', () => {
      const doc = new WikiDocument('Test', {});
      doc.appendChild(doc.createElement('p'));
      doc.appendChild(doc.createElement('div'));

      expect(doc.getChildCount()).toBe(2);

      doc.clear();

      expect(doc.getChildCount()).toBe(0);
      expect(doc.isEmpty()).toBe(true);
    });

    test('getChildCount returns child count', () => {
      const doc = new WikiDocument('Test', {});

      expect(doc.getChildCount()).toBe(0);

      doc.appendChild(doc.createElement('p'));
      expect(doc.getChildCount()).toBe(1);

      doc.appendChild(doc.createElement('div'));
      expect(doc.getChildCount()).toBe(2);
    });

    test('isEmpty returns true for empty document', () => {
      const doc = new WikiDocument('Test', {});

      expect(doc.isEmpty()).toBe(true);

      doc.appendChild(doc.createElement('p'));
      expect(doc.isEmpty()).toBe(false);
    });

    test('getStatistics returns statistics', () => {
      const doc = new WikiDocument('Test content', { page: 'TestPage' });
      doc.setMetadata('author', 'John');
      doc.appendChild(doc.createElement('p'));

      const stats = doc.getStatistics();

      expect(stats).toHaveProperty('nodeCount', 1);
      expect(stats).toHaveProperty('pageDataLength', 12);
      expect(stats).toHaveProperty('htmlLength');
      expect(stats).toHaveProperty('hasContext', true);
      expect(stats.metadata).toBeGreaterThan(0);
    });
  });

  describe('getRootElement', () => {
    test('returns root element', () => {
      const doc = new WikiDocument('Test', {});
      const root = doc.getRootElement();

      expect(root).toBeDefined();
      expect(root.tagName.toLowerCase()).toBe('body');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('handles null pageData in toString', () => {
      const doc = new WikiDocument(null, {});
      const str = doc.toString();

      expect(str).toContain('0 chars');
    });

    test('handles undefined pageData in getStatistics', () => {
      const doc = new WikiDocument(undefined, {});
      const stats = doc.getStatistics();

      expect(stats.pageDataLength).toBe(0);
    });

    test('fromJSON handles missing html field', () => {
      const json = { pageData: 'Test', metadata: { key: 'value' }, version: '1.0.0' };
      const doc = WikiDocument.fromJSON(json);

      expect(doc.getPageData()).toBe('Test');
      expect(doc.toHTML()).toBe(''); // Empty because no html was restored
    });

    test('fromJSON handles missing metadata field', () => {
      const json = { pageData: 'Test', html: '<p>Test</p>', version: '1.0.0' };
      const doc = WikiDocument.fromJSON(json);

      expect(doc.getPageData()).toBe('Test');
      expect(doc.toHTML()).toContain('<p>Test</p>');
      // Should still have default metadata from constructor
      expect(doc.getMetadata()).toHaveProperty('createdAt');
    });

    test('handles empty string pageData', () => {
      const doc = new WikiDocument('', {});

      expect(doc.getPageData()).toBe('');
      expect(doc.toString()).toContain('0 chars');
    });

    test('handles very large DOM structures', () => {
      const doc = new WikiDocument('Large content', {});

      // Add 100 elements
      for (let i = 0; i < 100; i++) {
        const para = doc.createElement('p', { id: `para-${i}` });
        para.textContent = `Paragraph ${i}`;
        doc.appendChild(para);
      }

      expect(doc.getChildCount()).toBe(100);
      expect(doc.isEmpty()).toBe(false);

      const stats = doc.getStatistics();
      expect(stats.nodeCount).toBe(100);
    });
  });

  describe('WeakRef Garbage Collection', () => {
    test('context can be garbage collected', () => {
      // Create a context that can be GC'd
      let context = { page: 'TestPage', user: 'john' };
      const doc = new WikiDocument('Test', context);

      // Verify context is accessible
      expect(doc.getContext()).toEqual(context);

      // Clear the reference (allowing GC) — the assignment IS the point here.
      // eslint-disable-next-line no-useless-assignment
      context = null;

      // Force garbage collection if available (V8)
      if (global.gc) {
        global.gc();
      }

      // Note: We can't reliably test GC in Jest without --expose-gc flag
      // This test documents the behavior rather than asserting it
      // In real scenarios, the WeakRef would allow GC when context goes out of scope
    });

    test('getContext returns null after context is cleared', () => {
      const doc = new WikiDocument('Test', { page: 'TestPage' });
      doc.setContext(null);

      expect(doc.getContext()).toBeNull();
    });

    test('document continues to work after context is cleared', () => {
      const doc = new WikiDocument('Test', { page: 'TestPage' });
      doc.setContext(null);

      // Document should still be functional
      const para = doc.createElement('p');
      para.textContent = 'Test';
      doc.appendChild(para);

      expect(doc.toHTML()).toContain('<p>Test</p>');
      expect(doc.getPageData()).toBe('Test');
    });
  });

  describe('Complex DOM Operations', () => {
    test('builds complex nested structure', () => {
      const doc = new WikiDocument('Complex page', {});

      // Create article structure
      const article = doc.createElement('article', { class: 'wiki-article' });

      const header = doc.createElement('header');
      const h1 = doc.createElement('h1');
      h1.textContent = 'Article Title';
      header.appendChild(h1);
      article.appendChild(header);

      const section = doc.createElement('section', { class: 'content' });
      for (let i = 0; i < 3; i++) {
        const para = doc.createElement('p');
        para.textContent = `Paragraph ${i}`;
        section.appendChild(para);
      }
      article.appendChild(section);

      const footer = doc.createElement('footer');
      const author = doc.createElement('span', { class: 'author' });
      author.textContent = 'John Doe';
      footer.appendChild(author);
      article.appendChild(footer);

      doc.appendChild(article);

      // Verify structure
      const html = doc.toHTML();
      expect(html).toContain('<article');
      expect(html).toContain('<header>');
      expect(html).toContain('Article Title');
      expect(html).toContain('Paragraph 0');
      expect(html).toContain('John Doe');
    });

    test('modifies complex structure', () => {
      const doc = new WikiDocument('Test', {});

      // Create initial structure
      const div = doc.createElement('div', { id: 'container' });
      const oldPara = doc.createElement('p', { id: 'old' });
      oldPara.textContent = 'Old content';
      div.appendChild(oldPara);
      doc.appendChild(div);

      // Modify structure
      const newPara = doc.createElement('p', { id: 'new' });
      newPara.textContent = 'New content';

      const container = doc.getElementById('container');
      const old = doc.getElementById('old');
      container.replaceChild(newPara, old);

      const html = doc.toHTML();
      expect(html).not.toContain('Old content');
      expect(html).toContain('New content');
      expect(html).toContain('id="new"');
    });
  });

  describe('Serialization Round-Trip', () => {
    test('maintains structure through JSON round-trip', () => {
      const original = new WikiDocument('Original markup', { page: 'TestPage' });
      original.setMetadata('author', 'John Doe');
      original.setMetadata('created', '2025-10-01');
      original.setMetadata('tags', ['test', 'wiki']);

      // Build complex structure
      const article = original.createElement('article');
      const h1 = original.createElement('h1', { id: 'title' });
      h1.textContent = 'Test Article';
      article.appendChild(h1);

      const section = original.createElement('section', { class: 'content' });
      const para1 = original.createElement('p');
      para1.textContent = 'First paragraph';
      const para2 = original.createElement('p');
      para2.textContent = 'Second paragraph';
      section.appendChild(para1);
      section.appendChild(para2);
      article.appendChild(section);

      original.appendChild(article);

      // Serialize
      const json = original.toJSON();

      // Deserialize
      const restored = WikiDocument.fromJSON(json, { page: 'TestPage' });

      // Verify all data is preserved
      expect(restored.getPageData()).toBe('Original markup');
      expect(restored.getMetadataValue('author')).toBe('John Doe');
      expect(restored.getMetadataValue('created')).toBe('2025-10-01');
      expect(restored.getMetadataValue('tags')).toEqual(['test', 'wiki']);

      // Verify HTML structure
      const restoredHTML = restored.toHTML();
      expect(restoredHTML).toContain('<h1 id="title">Test Article</h1>');
      expect(restoredHTML).toContain('First paragraph');
      expect(restoredHTML).toContain('Second paragraph');

      // Verify queries work on restored document
      expect(restored.getElementById('title')).not.toBeNull();
      expect(restored.querySelector('.content')).not.toBeNull();
      expect(restored.querySelectorAll('p').length).toBe(2);
    });
  });

  describe('Performance and Statistics', () => {
    test('getStatistics provides accurate metrics', () => {
      const content = 'This is test content with 31 characters';
      const doc = new WikiDocument(content, { page: 'TestPage' });

      doc.setMetadata('author', 'John');
      doc.setMetadata('version', '1.0');

      const para = doc.createElement('p');
      para.textContent = 'Test paragraph';
      doc.appendChild(para);

      const stats = doc.getStatistics();

      expect(stats.nodeCount).toBe(1);
      expect(stats.pageDataLength).toBe(39); // 'This is test content with 31 characters'.length
      expect(stats.htmlLength).toBeGreaterThan(0);
      expect(stats.hasContext).toBe(true);
      expect(stats.metadata).toBeGreaterThanOrEqual(3); // createdAt (default), version (default), author (custom), version (custom)
    });

    test('getStatistics handles document without context', () => {
      const doc = new WikiDocument('Test', null);
      const stats = doc.getStatistics();

      expect(stats.hasContext).toBe(false);
    });
  });
});
